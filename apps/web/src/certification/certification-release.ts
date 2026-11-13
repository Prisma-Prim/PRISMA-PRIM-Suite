import type { CertificateText } from './certification-decision';
import { certificateTexts } from './certification-response';
import type { ActAttribution } from './certification-attribution';
import {
  parseExchangeVersion,
  type ExchangeVersion,
} from './certification-exchanges';
import type { CertificationActorReference } from './certification-response';

export interface CertificateDraftValue {
  attachmentId: string;
  number: string;
  decisionVersionId: string;
  certificateDataVersionId: string;
  draftedOn: string;
}
export const OPINION_SKIP_REASONS = [
  'texts_already_agreed',
  'no_answer',
  'other',
] as const;
export type OpinionSkipReason = (typeof OPINION_SKIP_REASONS)[number];
export type ClientOpinionValue = {
  draftVersionId: string;
  businessDate: string;
} & (
  | { outcome: 'agreed'; exchangeRecordId: string }
  | {
      outcome: 'changes_requested';
      exchangeRecordId: string;
      requestedChange: string;
    }
  | { outcome: 'skipped'; skipReason: OpinionSkipReason; note: string | null }
);
export interface CertificateDraftApprovalValue {
  draftVersionId: string;
  approvedOn: string;
  textsConfirmed: true;
  numberConfirmed: true;
  validityConfirmed: true;
  independenceAttested: true;
  onBehalf: ActAttribution | null;
}
export interface ReleaseVersion<Value> {
  id: string;
  version: number;
  caseRevision: number;
  reason: string | null;
  recordedBy: CertificationActorReference;
  recordedAt: string;
  value: Value;
}
export const RELEASE_BLOCKERS = [
  'not_granted',
  'draft_missing',
  'draft_outdated',
  'opinion_missing',
  'changes_requested',
  'texts_differ',
  'discrepancies_open',
  'approval_missing',
] as const;
export type ReleaseBlocker = (typeof RELEASE_BLOCKERS)[number];
export interface CertificateRevision {
  id: string;
  index: number;
  caseRevision: number;
  reason: string;
  revisedOn: string;
  attachmentId: string;
  texts: CertificateText[];
  decisionVersionId: string;
  certificateDataVersionId: string;
  revisionMarked: boolean;
  independenceAttested: true;
  onBehalf: ActAttribution | null;
  recordedBy: CertificationActorReference;
  recordedAt: string;
  transmission: ExchangeVersion | null;
}
export interface CertificateRevisionValue {
  reason: string;
  revisedOn: string;
  attachmentId: string;
  revisionMarked: boolean;
  independenceAttested: true;
  onBehalf: ActAttribution | null;
}

export interface CertificateRelease {
  revisions: CertificateRevision[];
  currentRevisionIndex: number | null;
  revisionRequired: boolean;
  validity: {
    validFrom: string;
    validUntil: string;
    firstSurveillanceBy: string;
  } | null;
  drafts: ReleaseVersion<CertificateDraftValue>[];
  opinions: ReleaseVersion<ClientOpinionValue>[];
  approvals: ReleaseVersion<CertificateDraftApprovalValue>[];
  currentDraftId: string | null;
  outdated: boolean;
  approvalBlockers: ReleaseBlocker[];
  issuanceBlockers: ReleaseBlocker[];
  transmission: ExchangeVersion | null;
  daysSinceIssuance: number | null;
  legacyIssuance: boolean;
}
export type ReleaseCommand =
  | {
      kind: 'certificateRevision';
      path: 'certificate-revisions';
      value: CertificateRevisionValue;
    }
  | {
      kind: 'certificateDraft';
      path: 'certificate-draft';
      value: CertificateDraftValue & { reason?: string };
    }
  | {
      kind: 'clientOpinion';
      path: 'client-opinion';
      value: ClientOpinionValue & { reason?: string };
    }
  | {
      kind: 'draftApproval';
      path: 'certificate-draft-approval';
      value: CertificateDraftApprovalValue & { reason?: string };
    };

export function parseCertificateDraft(value: unknown): CertificateDraftValue {
  const body = object(value);
  return {
    attachmentId: text(body.attachmentId),
    number: text(body.number, 64),
    decisionVersionId: text(body.decisionVersionId),
    certificateDataVersionId: text(body.certificateDataVersionId),
    draftedOn: calendar(body.draftedOn),
  };
}
export function parseClientOpinion(value: unknown): ClientOpinionValue {
  const body = object(value);
  const base = {
    draftVersionId: text(body.draftVersionId),
    businessDate: calendar(body.businessDate),
  };
  switch (body.outcome) {
    case 'agreed':
      return {
        ...base,
        outcome: 'agreed',
        exchangeRecordId: text(body.exchangeRecordId),
      };
    case 'changes_requested':
      return {
        ...base,
        outcome: 'changes_requested',
        exchangeRecordId: text(body.exchangeRecordId),
        requestedChange: text(body.requestedChange, 2000),
      };
    case 'skipped': {
      const skipReason = oneOf(OPINION_SKIP_REASONS, body.skipReason);
      const note = nullableText(body.note, 2000);
      if (skipReason === 'other' && note === null) invalid();
      return { ...base, outcome: 'skipped', skipReason, note };
    }
    default:
      return invalid();
  }
}
export function parseDraftApproval(
  value: unknown,
): CertificateDraftApprovalValue {
  const body = object(value);
  if (
    body.textsConfirmed !== true ||
    body.numberConfirmed !== true ||
    body.validityConfirmed !== true ||
    body.independenceAttested !== true
  )
    invalid();
  const act = body.onBehalf === null ? null : object(body.onBehalf);
  return {
    draftVersionId: text(body.draftVersionId),
    approvedOn: calendar(body.approvedOn),
    textsConfirmed: true,
    numberConfirmed: true,
    validityConfirmed: true,
    independenceAttested: true,
    onBehalf:
      act === null
        ? null
        : {
            actedBy: text(act.actedBy, 200),
            actedByFunction: text(act.actedByFunction, 200),
            actedOn: calendar(act.actedOn),
            formAttachmentId: nullableText(act.formAttachmentId),
          },
  };
}

/** Additive HTTP fields are accepted; every consumed release field is proved. */
export function parseCertificateRelease(
  value: unknown,
  context?: { hasCertificate: boolean },
): CertificateRelease {
  const body = object(value);
  const validityBody =
    body.validity === undefined || body.validity === null
      ? null
      : object(body.validity);
  const validity =
    validityBody === null
      ? null
      : {
          validFrom: calendar(validityBody.validFrom),
          validUntil: calendar(validityBody.validUntil),
          firstSurveillanceBy: calendar(validityBody.firstSurveillanceBy),
        };
  if (
    validity &&
    (validity.validFrom >= validity.firstSurveillanceBy ||
      validity.firstSurveillanceBy >= validity.validUntil)
  )
    invalid();
  const drafts = versions(body.drafts, parseCertificateDraft);
  const opinions = versions(body.opinions, parseClientOpinion);
  const approvals = versions(body.approvals, parseDraftApproval);
  const currentDraftId = nullableText(body.currentDraftId);
  if ((drafts.at(-1)?.id ?? null) !== currentDraftId) invalid();
  const ids = new Set(drafts.map((entry) => entry.id));
  if (
    [...opinions, ...approvals].some(
      (entry) => !ids.has(entry.value.draftVersionId),
    )
  )
    invalid();
  const days = body.daysSinceIssuance;
  if (
    days !== null &&
    (typeof days !== 'number' || !Number.isSafeInteger(days) || days < 0)
  )
    invalid();
  const transmission =
    body.transmission === null ? null : parseExchangeVersion(body.transmission);
  if (
    transmission &&
    (transmission.direction !== 'sent' ||
      transmission.itemKind !== 'certificate' ||
      transmission.counterpart.kind !== 'client' ||
      days !== null)
  )
    invalid();
  const additions = [
    body.revisions,
    body.currentRevisionIndex,
    body.revisionRequired,
  ];
  const legacy = additions.every((entry) => entry === undefined);
  if (!legacy && additions.some((entry) => entry === undefined)) invalid();
  const revisions = legacy
    ? []
    : list(body.revisions).map(parseCertificateRevision);
  if (
    revisions.some(
      (entry, index) =>
        entry.index !== index + 1 ||
        (index > 0 &&
          entry.caseRevision <= (revisions[index - 1]?.caseRevision ?? 0)),
    ) ||
    new Set(revisions.map((entry) => entry.id)).size !== revisions.length ||
    new Set(revisions.map((entry) => entry.attachmentId)).size !==
      revisions.length
  )
    invalid();
  const currentRevisionIndex = legacy
    ? context?.hasCertificate
      ? 0
      : null
    : body.currentRevisionIndex === null
      ? null
      : nonnegative(body.currentRevisionIndex);
  if (
    (revisions.length > 0 &&
      currentRevisionIndex !== revisions.at(-1)?.index) ||
    (revisions.length === 0 &&
      currentRevisionIndex !== 0 &&
      currentRevisionIndex !== null) ||
    (context &&
      (context.hasCertificate
        ? currentRevisionIndex === null
        : currentRevisionIndex !== null))
  )
    invalid();
  const transmissions = revisions.flatMap((revision) =>
    revision.transmission ? [revision.transmission] : [],
  );
  if (
    new Set(transmissions.map((entry) => entry.id)).size !==
      transmissions.length ||
    transmissions.some(
      (entry) =>
        entry.id === transmission?.id ||
        revisions.filter((revision) =>
          entry.attachmentIds.includes(revision.attachmentId),
        ).length !== 1,
    )
  )
    invalid();
  const revisionRequired = legacy ? false : flag(body.revisionRequired);
  if (currentRevisionIndex === null && revisionRequired) invalid();
  return {
    revisions,
    currentRevisionIndex,
    revisionRequired,
    validity,
    drafts,
    opinions,
    approvals,
    currentDraftId,
    outdated: flag(body.outdated),
    approvalBlockers: blockers(body.approvalBlockers),
    issuanceBlockers: blockers(body.issuanceBlockers),
    transmission,
    daysSinceIssuance: days,
    legacyIssuance: flag(body.legacyIssuance),
  };
}

function versions<Value>(
  value: unknown,
  parse: (value: unknown) => Value,
): ReleaseVersion<Value>[] {
  const entries = list(value).map((value) => {
    const body = object(value);
    const author = object(body.recordedBy);
    const version = positive(body.version);
    const reason = nullableText(body.reason, 2000);
    if ((version === 1) !== (reason === null)) invalid();
    const recordedAt = text(body.recordedAt);
    if (!Number.isFinite(Date.parse(recordedAt))) invalid();
    return {
      id: text(body.id),
      version,
      caseRevision: positive(body.caseRevision),
      reason,
      recordedBy: {
        workspaceMembershipId: text(author.workspaceMembershipId),
        displayName: text(author.displayName, 200),
      },
      recordedAt,
      value: parse(body.value),
    };
  });
  if (
    new Set(entries.map((entry) => entry.id)).size !== entries.length ||
    entries.some(
      (entry, index) =>
        entry.version !== index + 1 ||
        (index > 0 &&
          entry.caseRevision <= (entries[index - 1]?.caseRevision ?? 0)),
    )
  )
    invalid();
  return entries;
}
function blockers(value: unknown): ReleaseBlocker[] {
  const result = list(value).map((entry) => oneOf(RELEASE_BLOCKERS, entry));
  if (new Set(result).size !== result.length) invalid();
  return result;
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  return Object.fromEntries(Object.entries(value));
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : invalid();
}
function text(value: unknown, max = 256): string {
  return typeof value === 'string' && value.trim() && value.length <= max
    ? value
    : invalid();
}
function nullableText(value: unknown, max = 256): string | null {
  return value === null ? null : text(value, max);
}
function positive(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : invalid();
}
function calendar(value: unknown): string {
  const date = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) &&
    new Date(date).toISOString().slice(0, 10) === date
    ? date
    : invalid();
}
function flag(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid();
}
function oneOf<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): Values[number] {
  return values.find((entry) => entry === value) ?? invalid();
}
function invalid(): never {
  throw new Error('Invalid Certificate release response.');
}

export function parseCertificateRevision(value: unknown): CertificateRevision {
  const body = object(value);
  if (body.independenceAttested !== true) return invalid();
  const author = object(body.recordedBy);
  const recordedAt = text(body.recordedAt);
  if (!Number.isFinite(Date.parse(recordedAt))) invalid();
  const attachmentId = text(body.attachmentId);
  const revisedOn = calendar(body.revisedOn);
  const transmission =
    body.transmission === null ? null : parseExchangeVersion(body.transmission);
  if (
    transmission &&
    (transmission.direction !== 'sent' ||
      transmission.itemKind !== 'certificate' ||
      transmission.counterpart.kind !== 'client' ||
      !transmission.attachmentIds.includes(attachmentId) ||
      transmission.businessDate < revisedOn)
  )
    invalid();
  const act = body.onBehalf === null ? null : object(body.onBehalf);
  return {
    id: text(body.id),
    index: positive(body.index),
    caseRevision: positive(body.caseRevision),
    reason: text(body.reason, 2000),
    revisedOn,
    attachmentId,
    texts: certificateTexts(body.texts),
    decisionVersionId: text(body.decisionVersionId),
    certificateDataVersionId: text(body.certificateDataVersionId),
    revisionMarked: flag(body.revisionMarked),
    independenceAttested: true,
    onBehalf:
      act === null
        ? null
        : {
            actedBy: text(act.actedBy, 200),
            actedByFunction: text(act.actedByFunction, 200),
            actedOn: calendar(act.actedOn),
            formAttachmentId: nullableText(act.formAttachmentId),
          },
    recordedBy: {
      workspaceMembershipId: text(author.workspaceMembershipId),
      displayName: text(author.displayName, 200),
    },
    recordedAt,
    transmission,
  };
}
function nonnegative(value: unknown): number {
  return value === 0 ? 0 : positive(value);
}
