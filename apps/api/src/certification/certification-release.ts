import type { CertificateRevision } from './certification-revisions.js';
import type { ActAttribution } from './certification-attribution.js';
import type { ExchangeRecordVersion } from './certification-exchanges.js';
import type { CertificationActorReference } from './certification.types.js';

/** Exact facts shown by one immutable draft PDF. */
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

/** An opinion belongs to one exact draft, never to a mutable current PDF. */
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

/** The read section is complete even when the exchange register is paged. */
export interface CertificateRelease {
  revisions: CertificateRevision[];
  currentRevisionIndex: number | null;
  revisionRequired: boolean;
  drafts: ReleaseVersion<CertificateDraftValue>[];
  opinions: ReleaseVersion<ClientOpinionValue>[];
  approvals: ReleaseVersion<CertificateDraftApprovalValue>[];
  validity: {
    validFrom: string;
    validUntil: string;
    firstSurveillanceBy: string;
  } | null;
  currentDraftId: string | null;
  outdated: boolean;
  approvalBlockers: ReleaseBlocker[];
  issuanceBlockers: ReleaseBlocker[];
  transmission: ExchangeRecordVersion | null;
  daysSinceIssuance: number | null;
  legacyIssuance: boolean;
}

/*
 * HTTP commands, under /certification-cases/:caseId, are POST:
 * certificate-draft, client-opinion, certificate-draft-approval.
 * Each body is { expectedRevision, reason?, ...Value } above. The server
 * validates all explicit version IDs against the locked Case. A correction
 * supplies reason. Commands return the existing Case receipt; clients then
 * reload the live Case. CaseDetail gains `release: CertificateRelease`.
 * Certificate gains issuedOn: string|null and approvedDraftVersionId:
 * string|null. New issuance commands require issuedOn; legacy rows stay null.
 */

import type {
  CertificationStepVersion,
  CertificateRecord,
} from './certification.types.js';
import { currentExchanges } from './certification-exchanges.js';
import {
  certificateValidity,
  sameCertificateTexts,
} from './certification-decision.js';

/** The current gate is derived from immutable refs, never from text similarity. */
export function certificateRelease(input: {
  steps: readonly CertificationStepVersion[];
  certificate: CertificateRecord | null;
  revisions?: readonly CertificateRevision[];
  exchanges: readonly ExchangeRecordVersion[];
  discrepanciesOpen: boolean;
  today: string;
}): CertificateRelease {
  const drafts = input.steps.flatMap((step) =>
    step.step === 'certificate_draft' ? [step] : [],
  );
  const opinions = input.steps.flatMap((step) =>
    step.step === 'client_opinion' ? [step] : [],
  );
  const approvals = input.steps.flatMap((step) =>
    step.step === 'certificate_draft_approval' ? [step] : [],
  );
  const draft = drafts.at(-1);
  const decision = input.steps
    .flatMap((step) => (step.step === 'decision' ? [step] : []))
    .at(-1);
  const data = input.steps
    .flatMap((step) => (step.step === 'certificate_data' ? [step] : []))
    .at(-1);
  const opinion = opinions
    .filter((step) => step.value.draftVersionId === draft?.id)
    .at(-1);
  const approval = approvals
    .filter((step) => step.value.draftVersionId === draft?.id)
    .at(-1);
  const outdated =
    draft !== undefined &&
    (draft.value.decisionVersionId !== decision?.id ||
      draft.value.certificateDataVersionId !== data?.id);
  const approvalBlockers: ReleaseBlocker[] = [];
  if (decision?.value.decision !== 'granted')
    approvalBlockers.push('not_granted');
  if (!draft) approvalBlockers.push('draft_missing');
  else if (outdated) approvalBlockers.push('draft_outdated');
  if (!opinion) approvalBlockers.push('opinion_missing');
  else if (
    opinions.some(
      (entry) =>
        entry.value.draftVersionId === draft?.id &&
        entry.value.outcome === 'changes_requested',
    )
  )
    approvalBlockers.push('changes_requested');
  if (
    decision?.value.decision === 'granted' &&
    (!data ||
      !sameCertificateTexts(decision.value.grantedTexts, data.value.texts))
  )
    approvalBlockers.push('texts_differ');
  if (input.discrepanciesOpen) approvalBlockers.push('discrepancies_open');
  // Approval is the consistency gate. Later unrelated Discrepancies cannot
  // move that passed gate to issuance, but changed refs/opinion invalidate it.
  const issuanceBlockers = approvalBlockers.filter(
    (code) => code !== 'discrepancies_open',
  );
  if (!approval || approvalNeedsRenewal({ approval, opinion }))
    issuanceBlockers.push('approval_missing');
  const certificate = input.certificate;
  const certificateAttachments = new Set([
    ...(certificate ? [certificate.attachmentId] : []),
    ...(input.revisions ?? []).map((revision) => revision.attachmentId),
  ]);
  const revisions = (input.revisions ?? []).map((revision) => ({
    ...revision,
    transmission:
      currentExchanges(input.exchanges)
        .filter(
          (exchange) =>
            exchange.direction === 'sent' &&
            exchange.itemKind === 'certificate' &&
            exchange.counterpart.kind === 'client' &&
            exchange.attachmentIds.includes(revision.attachmentId) &&
            exchange.attachmentIds.filter((id) =>
              certificateAttachments.has(id),
            ).length === 1 &&
            exchange.businessDate >= revision.revisedOn,
        )
        .sort(
          (left, right) =>
            left.businessDate.localeCompare(right.businessDate) ||
            left.sequence - right.sequence,
        )[0] ?? null,
  }));
  const effectiveTexts = revisions.at(-1)?.texts ?? certificate?.texts;
  const revisionRequired =
    certificate !== null &&
    effectiveTexts !== undefined &&
    (!data ||
      decision?.value.decision !== 'granted' ||
      !sameCertificateTexts(effectiveTexts, data.value.texts) ||
      !sameCertificateTexts(effectiveTexts, decision.value.grantedTexts));
  const transmission = certificate
    ? (currentExchanges(input.exchanges)
        .filter(
          (exchange) =>
            exchange.direction === 'sent' &&
            exchange.itemKind === 'certificate' &&
            exchange.counterpart.kind === 'client' &&
            exchange.attachmentIds.includes(certificate.attachmentId) &&
            (certificate.issuedOn === null ||
              exchange.businessDate >= certificate.issuedOn),
        )
        .sort(
          (left, right) =>
            left.businessDate.localeCompare(right.businessDate) ||
            left.sequence - right.sequence,
        )[0] ?? null)
    : null;
  return {
    revisions,
    currentRevisionIndex: certificate ? (revisions.at(-1)?.index ?? 0) : null,
    revisionRequired,
    drafts,
    opinions,
    approvals,
    validity:
      decision?.value.decision === 'granted'
        ? certificateValidity(decision.value.decidedOn)
        : null,
    currentDraftId: draft?.id ?? null,
    outdated,
    approvalBlockers,
    issuanceBlockers,
    transmission,
    daysSinceIssuance:
      certificate?.issuedOn && !transmission
        ? Math.max(
            0,
            Math.round(
              (Date.parse(input.today + 'T00:00:00Z') -
                Date.parse(certificate.issuedOn + 'T00:00:00Z')) /
                86_400_000,
            ),
          )
        : null,
    legacyIssuance: certificate !== null && certificate.issuedOn === null,
  };
}

/** A later opinion is a distinct approval context even on the same business date. */
export function approvalNeedsRenewal({
  approval,
  opinion,
}: {
  approval: ReleaseVersion<CertificateDraftApprovalValue> | undefined;
  opinion: ReleaseVersion<ClientOpinionValue> | undefined;
}): boolean {
  return (
    approval !== undefined &&
    opinion !== undefined &&
    approval.value.draftVersionId === opinion.value.draftVersionId &&
    opinion.caseRevision > approval.caseRevision
  );
}
