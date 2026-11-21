import { unexpected } from './certification-command';
import type { IntakeKind } from './CertificationIntake';
import {
  conflictCode,
  conflictDiscrepancies,
  conflictFailures,
  type ApiResult,
} from '../api/authenticated-api-client';
import { type CertificationMessageKey } from './certification.copy';
import { parseDecisionFailures } from './certification-decision';
import { parseBlockingDiscrepancies } from './certification-consistency';

import { type StageMutationKind } from './CertificationStages';
import {
  refusedWith,
  type Intent,
  type Feedback,
} from './certification-command';

import { type TeamKind } from './CertificationTeam';
import { isClosingCommand, type ClosingKind } from './CertificationClosing';

export type MutationKind =
  | 'open'
  | 'attach'
  | 'team'
  | 'decision'
  | 'finding'
  | 'discrepancy'
  | 'discrepancyResolution'
  | 'exchange'
  | 'reverification'
  | 'withdrawal'
  | StageMutationKind
  | ClosingKind
  | TeamKind
  | IntakeKind;
/** A correction without a reason, or a first record with one, per step. */
function correctionReasonRefusal(kind: MutationKind): CertificationMessageKey {
  switch (kind) {
    case 'duration':
      return 'blockedDurationCorrectionReason';
    case 'agreement':
      return 'blockedAgreementCorrectionReason';
    case 'team':
      return 'blockedTeamCorrectionReason';
    case 'stage1Plan':
    case 'stage2Plan':
      return 'blockedStagePlanCorrectionReason';
    case 'stage1Report':
    case 'stage2Report':
      return 'blockedStageReportCorrectionReason';
    case 'finding':
      return 'blockedFindingCorrectionReason';
    case 'exchange':
      return 'exchangeReasonRequired';
    case 'recommendation':
    case 'dossierReview':
    case 'certificationDecision':
    case 'certificateData':
    case 'certificateDraft':
    case 'clientOpinion':
    case 'draftApproval':
    case 'certificate':
    case 'certificateRevision':
      return 'blockedVersionCorrectionReason';
    case 'open':
    case 'application':
    case 'review':
    case 'attach':
    case 'decision':
    case 'discrepancy':
    case 'discrepancyResolution':
    case 'reverification':
    case 'withdrawal':
      return 'blockedCorrectionReason';
  }
  return unexpected(kind);
}

/** Who the server found on the audit team, in the words of each command. */
function independenceRefusal(kind: MutationKind): Feedback {
  switch (kind) {
    case 'finding':
      return refusedWith('findingIndependence', true);
    case 'team':
      return refusedWith('teamMemberDecided', true);
    case 'dossierReview':
      return refusedWith('dossierIndependence', true);
    // The named decision maker or signatory may be corrected in the draft.
    case 'certificationDecision':
      return refusedWith('decisionMakerIndependence');
    case 'certificateDraft':
    case 'clientOpinion':
    case 'certificate':
    case 'certificateRevision':
      return refusedWith('certificateIndependence');
    // Only the person approving on behalf of the certification body is checked.
    case 'draftApproval':
    case 'stage1Report':
    case 'stage2Report':
      return refusedWith('actingOnTeam');
    case 'discrepancy':
    case 'discrepancyResolution':
    case 'reverification':
      return refusedWith('discrepancyIndependence', true);
    case 'decision':
    case 'open':
    case 'application':
    case 'review':
    case 'duration':
    case 'attach':
    case 'agreement':
    case 'stage1Plan':
    case 'stage2Plan':
    case 'recommendation':
    case 'certificateData':
    case 'exchange':
    case 'withdrawal':
      return refusedWith('teamIndependence', true);
  }
  return unexpected(kind);
}

/** A chosen attachment without its role, in the words of each command. */
function attachmentRoleRefusal(kind: MutationKind): CertificationMessageKey {
  switch (kind) {
    case 'finding':
      return 'findingEvidenceUnavailable';
    case 'certificationDecision':
      return 'decisionFormRole';
    case 'certificateData':
      return 'certificateDataDocumentRole';
    case 'certificateDraft':
    case 'clientOpinion':
    case 'draftApproval':
    case 'certificate':
    case 'certificateRevision':
      return 'certificatePdfRole';
    case 'discrepancy':
    case 'discrepancyResolution':
      return 'discrepancyDocumentUnavailable';
    case 'open':
    case 'application':
    case 'review':
    case 'duration':
    case 'attach':
    case 'agreement':
    case 'team':
    case 'decision':
    case 'stage1Plan':
    case 'stage2Plan':
    case 'stage1Report':
    case 'stage2Report':
    case 'recommendation':
    case 'dossierReview':
      return 'stageAttachmentRole';
    case 'exchange':
    case 'reverification':
    case 'withdrawal':
      return 'discrepancyDocumentUnavailable';
  }
  return unexpected(kind);
}

/** A missing attestation of independence, in the words of each command. */
function attestationRefusal(kind: MutationKind): CertificationMessageKey {
  switch (kind) {
    case 'decision':
      return 'teamDecisionAttestationRequired';
    case 'dossierReview':
      return 'dossierAttestationRequired';
    case 'certificateDraft':
    case 'clientOpinion':
    case 'draftApproval':
    case 'certificate':
    case 'certificateRevision':
      return 'certificateAttestationRequired';
    case 'certificationDecision':
    case 'open':
    case 'application':
    case 'review':
    case 'duration':
    case 'attach':
    case 'agreement':
    case 'team':
    case 'finding':
    case 'stage1Plan':
    case 'stage2Plan':
    case 'stage1Report':
    case 'stage2Report':
    case 'recommendation':
    case 'certificateData':
    case 'discrepancy':
    case 'discrepancyResolution':
    case 'exchange':
    case 'reverification':
    case 'withdrawal':
      return 'decisionAttestationRequired';
  }
  return unexpected(kind);
}

/**
 * The server's unmet decision preconditions in plain language; an unknown
 * list is never shown as the server's reasons.
 */
function preconditionsRefusal(result: ApiResult<unknown>): Feedback {
  const failures = parseDecisionFailures(conflictFailures(result));
  const named = parseBlockingDiscrepancies(conflictDiscrepancies(result));
  return failures
    ? {
        status: 'unmet',
        source: 'server',
        failures,
        discrepancies: named ?? [],
      }
    : refusedWith('decisionPreconditionsUnknown', true);
}

/** A refused or failed command, in the plain language of its reason. */
export function commandFeedback(
  kind: MutationKind,
  result: ApiResult<unknown>,
  intent: Intent,
): Feedback {
  switch (result.status) {
    case 'forbidden':
      // Attaching also needs the Document rights; the Case stays readable.
      return refusedWith(kind === 'attach' ? 'documentsDenied' : 'denied');
    case 'unauthorized':
      return refusedWith('denied');
    case 'notFound':
      return refusedWith(
        kind === 'open'
          ? 'entityUnavailable'
          : kind === 'attach'
            ? 'attachUnavailable'
            : 'unavailable',
      );
    case 'validation':
      switch (result.code) {
        case 'CERTIFICATION_REVIEW_CRITERIA_NOT_MET':
          return refusedWith('criteriaNotMet');
        case 'CERTIFICATION_DURATION_JUSTIFICATION_REQUIRED':
          return refusedWith('durationJustificationRequired');
        case 'CERTIFICATION_DURATION_STAGES_MISMATCH':
          return refusedWith('durationStagesMismatch');
        case 'CERTIFICATION_DURATION_REFUSED':
          return refusedWith('durationRefused');
        case 'CERTIFICATION_TEAM_LEADER':
          return refusedWith('teamLeaderRule');
        case 'CERTIFICATION_TEAM_CATEGORY':
          return refusedWith('teamCategoryRule');
        case 'CERTIFICATION_TEAM_CONFLICT_NOTE':
          return refusedWith('teamConflictNoteRequired');
        case 'CERTIFICATION_TEAM_MEMBER_UNKNOWN':
          return refusedWith('teamMemberUnknown');
        case 'CERTIFICATION_STAGE_DATES':
          return refusedWith('stageDatesRule');
        case 'CERTIFICATION_STAGE_DEVIATION_NOTE':
          // The client mirrors the rule: the confirmed duration has changed.
          return refusedWith('stageDeviationNoteRule', true);
        case 'CERTIFICATION_DOCUMENT_REVIEW_INCOMPLETE':
          return refusedWith('stageDocumentReviewRequired');
        case 'CERTIFICATION_FINDING_CLAUSE_REQUIRED':
          return refusedWith('findingClauseRequired');
        case 'CERTIFICATION_FINDING_CLASSIFICATION_STAGE':
          return refusedWith('findingClassificationStage');
        case 'CERTIFICATION_FINDING_EVIDENCE_REQUIRED':
          return refusedWith('findingEvidenceRequired');
        case 'CERTIFICATION_INDEPENDENCE_ATTESTATION':
          return refusedWith(attestationRefusal(kind));
        case 'CERTIFICATION_TEAM_ANALYSIS_REQUIRED':
          return refusedWith('teamAnalysisRequired');
        case 'CERTIFICATION_EXCHANGE_NOTE_REQUIRED':
          return refusedWith('exchangeNoteRequired');
        default:
          return refusedWith('invalid');
      }
    case 'conflict':
      switch (conflictCode(result)) {
        case 'STALE_VERSION':
          return refusedWith('stale', true);
        case 'CERTIFICATION_APPLICATION_NOT_ACCEPTED':
          return refusedWith('durationNotAccepted', true);
        case 'CERTIFICATION_ORDER_REFERENCE_TAKEN':
          return refusedWith('referenceTaken');
        case 'CERTIFICATION_DISCREPANCY_NOT_OPEN':
          return refusedWith('discrepancyNotOpen', true);
        case 'CERTIFICATION_DISCREPANCY_CRITICAL':
          return refusedWith('discrepancyCritical', true);
        case 'CERTIFICATION_DISCREPANCY_CORRECTED_BY_RECORD':
          return refusedWith('discrepancyCorrectedByRecord', true);
        case 'CERTIFICATION_NOT_ON_TEAM':
          return refusedWith('discrepancyNotOnTeam', true);
        case 'CERTIFICATION_CORRECTING_RECORD_UNKNOWN':
          return refusedWith('discrepancyCorrectionUnknown', true);
        case 'CERTIFICATION_DISCREPANCIES_OPEN':
          return refusedWith('certificateDiscrepanciesOpen', true);
        case 'CERTIFICATION_APPLICATION_MISSING':
          return refusedWith('blockedReviewBeforeApplication', true);
        case 'CERTIFICATION_APPLICATION_ALREADY_REVIEWED':
          return refusedWith('blockedAlreadyReviewed', true);
        case 'CERTIFICATION_CASE_CLOSED':
          return refusedWith(
            isClosingCommand(kind) ? 'caseClosedRefusal' : 'blockedClosed',
            true,
          );
        case 'CERTIFICATION_CORRECTION_REASON':
          return refusedWith(correctionReasonRefusal(kind), true);
        case 'CERTIFICATION_DOCUMENT_ALREADY_ATTACHED':
          return refusedWith('attachDuplicate', true);
        case 'CERTIFICATION_DURATION_MISSING':
          return refusedWith('blockedAgreementBeforeDuration', true);
        case 'CERTIFICATION_AGREEMENT_DOCUMENT':
          return refusedWith('agreementDocumentRole', true);
        case 'CERTIFICATION_AGREEMENT_IN_FUTURE':
          return refusedWith('agreementInFuture');
        case 'CERTIFICATION_ACT_IN_FUTURE':
          return refusedWith('actInFuture');
        case 'CERTIFICATION_AGREEMENT_MISSING':
          return refusedWith('blockedTeamBeforeAgreement', true);
        case 'CERTIFICATION_TEAM_NOT_PENDING':
          return refusedWith('blockedTeamNotPending', true);
        case 'CERTIFICATION_INDEPENDENCE':
          return independenceRefusal(kind);
        case 'CERTIFICATION_TEAM_CONFLICT_DECLARED':
          return refusedWith('teamConflictDeclared');
        case 'CERTIFICATION_CORRECTION_UNCHANGED':
          return refusedWith('blockedCorrectionUnchanged');
        case 'CERTIFICATION_TEAM_NOT_APPROVED':
          return refusedWith('blockedStagePlanTeamNotApproved', true);
        case 'CERTIFICATION_STAGE_1_NOT_READY':
          return refusedWith('blockedStage2NotReady', true);
        case 'CERTIFICATION_STAGE_1_NONCONFORMITY_OPEN':
          return refusedWith('blockedStage2NonconformityOpen', true);
        case 'CERTIFICATION_STAGE_CLOSED':
          return refusedWith('blockedFindingStageClosed', true);
        case 'CERTIFICATION_FINDING_NOT_OPEN':
          return refusedWith('findingNotOpen', true);
        case 'CERTIFICATION_FINDING_NO_RESPONSE':
          return refusedWith('findingNoResponse', true);
        case 'CERTIFICATION_FINDING_PLAN_NOT_ADEQUATE':
          return refusedWith('findingPlanNotAdequate', true);
        case 'CERTIFICATION_FINDING_LIMIT_PASSED':
          return refusedWith('findingLimitPassed', true);
        case 'CERTIFICATION_STAGE_DATES':
          // A Stage 2 start, or a report date, against the read Case.
          return refusedWith(
            kind === 'stage1Plan' || kind === 'stage2Plan'
              ? 'stage2StartRule'
              : 'stageReportDateRule',
          );
        case 'CERTIFICATION_STAGE_NOT_PLANNED':
          return refusedWith(
            kind === 'finding'
              ? 'blockedFindingStageNotPlanned'
              : 'blockedStageReportBeforePlan',
            true,
          );
        case 'CERTIFICATION_NOT_TEAM_LEADER':
          return refusedWith(
            kind === 'finding'
              ? 'blockedFindingNotTeamLeader'
              : kind === 'recommendation'
                ? 'blockedRecommendationNotTeamLeader'
                : 'blockedNotTeamLeader',
            true,
          );
        case 'CERTIFICATION_ATTACHMENT_ROLE':
          return refusedWith(attachmentRoleRefusal(kind), true);
        case 'CERTIFICATION_STAGE_2_NOT_REPORTED':
          return refusedWith(
            kind === 'certificateData'
              ? 'blockedCertificateDataBeforeStage2'
              : 'blockedRecommendationBeforeStage2',
            true,
          );
        case 'CERTIFICATION_FINDINGS_OPEN':
          return refusedWith('blockedRecommendationFindingsOpen', true);
        case 'CERTIFICATION_RECOMMENDATION_MISSING':
          return refusedWith('blockedDossierBeforeRecommendation', true);
        case 'CERTIFICATION_DECIDED':
          return refusedWith('blockedDecided', true);
        case 'CERTIFICATION_ISSUED_DECISION_FIXED':
          return refusedWith('issuedDecisionFixed', true);
        case 'CERTIFICATION_DECISION_OUTCOME_FIXED':
          return refusedWith('decisionOutcomeFixedRefusal', true);
        case 'CERTIFICATION_DECISION_PRECONDITIONS':
          return preconditionsRefusal(result);
        case 'CERTIFICATION_NOT_GRANTED':
          return refusedWith('blockedCertificateNotGranted', true);
        case 'CERTIFICATION_CERTIFICATE_DATA_MISSING':
          return refusedWith('blockedCertificateDataMissing', true);
        case 'CERTIFICATION_CERTIFICATE_DATA_DIFFERS':
          return refusedWith('certificateDataDiffers', true);
        case 'CERTIFICATION_CERTIFICATE_APPROVAL_REQUIRED':
        case 'CERTIFICATION_DRAFT_APPROVAL_PRECONDITIONS':
        case 'CERTIFICATION_DRAFT_OUTDATED':
          return refusedWith('blockedCertificateApprovalMissing', true);
        case 'CERTIFICATION_CERTIFICATE_NUMBER_DIFFERS':
        case 'CERTIFICATION_CERTIFICATE_ISSUE_DATE':
          return refusedWith('certificateValidation');
        case 'CERTIFICATION_CERTIFICATE_PDF_REUSED':
          return refusedWith('certificatePdfReused', true);
        case 'CERTIFICATION_CERTIFICATE_NUMBER_TAKEN':
          return refusedWith('certificateNumberTaken');
        case 'CERTIFICATION_EXCHANGE_IN_FUTURE':
          return refusedWith('exchangeInFuture');
        case 'CERTIFICATION_REVERIFICATION_SOURCE_UNKNOWN':
          return refusedWith('reverificationSourceUnknown', true);
        case 'CERTIFICATION_REVERIFICATION_AUTOMATIC':
        case 'CERTIFICATION_REVERIFICATION_WITHDRAWN':
          return refusedWith('reverificationNotWithdrawable', true);
        default:
          return refusedWith('conflict', kind !== 'open');
      }
    case 'ok':
    case 'error':
      // A transport failure or unexpected status may hide a recorded command.
      return { status: 'uncertain', intent };
  }
  return unexpected(result);
}
