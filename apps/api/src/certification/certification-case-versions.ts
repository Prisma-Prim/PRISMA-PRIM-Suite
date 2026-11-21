import {
  certificateDraft,
  clientOpinion,
  certificateDraftApproval,
} from './certification-release.validation.js';
import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import {
  certificationCaseDocuments,
  certificationCases,
  certificationStepVersions,
} from '../database/schema/certification.js';
import { durationDetermination } from './certification-duration.validation.js';
import { auditTeam, teamDecision } from './certification-team.js';
import {
  certificateData,
  certificationDecision,
  dossierReview,
  recommendation,
} from './certification-decision.js';
import {
  stage1Report,
  stage2Report,
  stagePlan,
} from './certification-stages.js';
import type {
  StageStepVersion,
  TeamDecisionVersion,
  TeamVersion,
  AgreementVersion,
  CertificationAttachment,
  ApplicationReviewVersion,
  DurationVersion,
  ApplicationVersion,
  CertificationStepVersion,
} from './certification.types.js';
import {
  agreement,
  applicationFacts,
  applicationReview,
} from './certification.validation.js';

export type CaseRow = typeof certificationCases.$inferSelect;

export type StepRow = typeof certificationStepVersions.$inferSelect;

export type CaseCommandInput = {
  actor: ActorContext;
  caseId: string;
  body: unknown;
  key: string | undefined;
};

export function latest(
  steps: readonly StepRow[],
  step: StepRow['step'],
): StepRow | undefined {
  return steps.filter((row) => row.step === step).at(-1);
}

/** Once decided, only the Certificate data and the Certificate remain. */
export function requireUndecided(steps: readonly StepRow[]): void {
  if (latest(steps, 'decision'))
    throw stepConflict(
      'CERTIFICATION_DECIDED',
      'The Case is decided; only the Certificate data and the Certificate remain.',
    );
}

export function stepConflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

/** A correction that changes nothing would only add false history. */
export function unchangedCorrection(): ConflictException {
  return stepConflict(
    'CERTIFICATION_CORRECTION_UNCHANGED',
    'The correction changes no recorded value.',
  );
}

/**
 * Equal stored and validated values, whatever their key order. The validated
 * value takes its stored JSON form first, so absent optional keys compare
 * like the stored payload.
 */
export function sameValue(stored: unknown, value: object): boolean {
  const json: unknown = JSON.parse(JSON.stringify(value));
  return (
    commandFingerprint({ value: stored }) ===
    commandFingerprint({ value: json })
  );
}

function base(row: StepRow) {
  return {
    id: row.id,
    version: row.version,
    caseRevision: row.caseRevision,
    reason: row.reason,
    recordedBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    recordedAt: row.recordedAt.toISOString(),
  };
}

export function applicationVersion(row: StepRow): ApplicationVersion {
  return {
    ...base(row),
    step: 'application',
    value: persisted(() => applicationFacts(row.payload)),
  };
}

export function reviewVersion(row: StepRow): ApplicationReviewVersion {
  return {
    ...base(row),
    step: 'application_review',
    value: persisted(() => applicationReview(row.payload)),
  };
}

export function recommendationVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'recommendation' }> {
  return {
    ...base(row),
    step: 'recommendation',
    value: persisted(() => recommendation(row.payload)),
  };
}

export function dossierReviewVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'dossier_review' }> {
  return {
    ...base(row),
    step: 'dossier_review',
    value: persisted(() => dossierReview(row.payload)),
  };
}

export function decisionVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'decision' }> {
  return {
    ...base(row),
    step: 'decision',
    value: persisted(() => certificationDecision(row.payload)),
  };
}

export function certificateDataVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'certificate_data' }> {
  return {
    ...base(row),
    step: 'certificate_data',
    value: persisted(() => certificateData(row.payload)),
  };
}

/** The latest team version when its latest decision approves it. */
export function approvedTeam(steps: readonly StepRow[]) {
  const team = latest(steps, 'team');
  const decided = latest(steps, 'team_decision');
  if (!team || !decided) return undefined;
  const decision = teamDecisionVersion(decided).value;
  return decision.decision === 'approved' &&
    decision.teamVersion === team.version
    ? teamVersion(team).value
    : undefined;
}

export function stage1Version(
  row: StepRow,
): Extract<StageStepVersion, { step: 'stage_1_report' }> {
  return {
    ...base(row),
    step: 'stage_1_report',
    value: persisted(() => stage1Report(row.payload)),
  };
}

export function stage2Version(
  row: StepRow,
): Extract<StageStepVersion, { step: 'stage_2_report' }> {
  return {
    ...base(row),
    step: 'stage_2_report',
    value: persisted(() => stage2Report(row.payload)),
  };
}

export function stagePlanVersion(row: StepRow) {
  return { ...base(row), value: persisted(() => stagePlan(row.payload)) };
}

export function stageStepVersion(row: StepRow): StageStepVersion {
  switch (row.step) {
    case 'stage_1_plan':
      return { ...stagePlanVersion(row), step: 'stage_1_plan' };
    case 'stage_2_plan':
      return { ...stagePlanVersion(row), step: 'stage_2_plan' };
    case 'stage_1_report':
      return stage1Version(row);
    case 'stage_2_report':
      return stage2Version(row);
    default:
      throw new InternalServerErrorException('Not a Stage step.');
  }
}

export function teamVersion(row: StepRow): TeamVersion {
  return {
    ...base(row),
    step: 'team',
    value: persisted(() => auditTeam(row.payload)),
  };
}

export function teamDecisionVersion(row: StepRow): TeamDecisionVersion {
  return {
    ...base(row),
    step: 'team_decision',
    value: persisted(() => teamDecision(row.payload)),
  };
}

export function agreementVersion(row: StepRow): AgreementVersion {
  return {
    ...base(row),
    step: 'agreement',
    value: persisted(() => agreement(row.payload)),
  };
}

export function attachment(
  row: typeof certificationCaseDocuments.$inferSelect,
): CertificationAttachment {
  return {
    id: row.id,
    caseRevision: row.caseRevision,
    role: row.role,
    documentId: row.documentId,
    versionId: row.versionId,
    representationId: row.representationId,
    versionNumber: row.versionNumber,
    sourceTitle: row.sourceTitle,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    note: row.note,
    attachedBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    attachedAt: row.attachedAt.toISOString(),
  };
}

export function durationVersion(row: StepRow): DurationVersion {
  return {
    ...base(row),
    step: 'duration',
    value: persisted(() => durationDetermination(row.payload)),
  };
}

/** Stored payloads were validated on write; a failure here is corruption. */
export function persisted<T>(decode: () => T): T {
  try {
    return decode();
  } catch {
    throw new InternalServerErrorException(
      'A recorded certification step is unreadable.',
    );
  }
}

export function stepVersion(row: StepRow): CertificationStepVersion {
  switch (row.step) {
    case 'application':
      return applicationVersion(row);
    case 'application_review':
      return reviewVersion(row);
    case 'duration':
      return durationVersion(row);
    case 'agreement':
      return agreementVersion(row);
    case 'team':
      return teamVersion(row);
    case 'team_decision':
      return teamDecisionVersion(row);
    case 'stage_1_plan':
    case 'stage_1_report':
    case 'stage_2_plan':
    case 'stage_2_report':
      return stageStepVersion(row);
    case 'recommendation':
      return recommendationVersion(row);
    case 'dossier_review':
      return dossierReviewVersion(row);
    case 'decision':
      return decisionVersion(row);
    case 'certificate_data':
      return certificateDataVersion(row);
    case 'certificate_draft':
      return certificateDraftVersion(row);
    case 'client_opinion':
      return clientOpinionVersion(row);
    case 'certificate_draft_approval':
      return certificateDraftApprovalVersion(row);
  }
  return unexpectedStep(row.step);
}

function unexpectedStep(value: never): never {
  throw new InternalServerErrorException(`Unexpected step ${String(value)}`);
}

export function certificateDraftVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'certificate_draft' }> {
  return {
    ...base(row),
    step: 'certificate_draft',
    value: persisted(() => certificateDraft(row.payload)),
  };
}

export function clientOpinionVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'client_opinion' }> {
  return {
    ...base(row),
    step: 'client_opinion',
    value: persisted(() => clientOpinion(row.payload)),
  };
}

export function certificateDraftApprovalVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'certificate_draft_approval' }> {
  return {
    ...base(row),
    step: 'certificate_draft_approval',
    value: persisted(() => certificateDraftApproval(row.payload)),
  };
}
