import type { CertificationActorReference } from './certification-response';
import type { AuditStage } from './certification-stages';

/**
 * The server's Finding contract: the leader of the approved audit team
 * records classified Findings of a planned Stage and follows each
 * nonconformity up; an approver outside the team may reclassify. Every
 * statement, classification, response, judgment and verification is a
 * version. The server stays authoritative; this module only mirrors its
 * rules and never recomputes its derived dates.
 */
export const FINDING_CLASSIFICATIONS = [
  'major_nonconformity',
  'minor_nonconformity',
  'opportunity_for_improvement',
  'area_of_concern',
] as const;
export type FindingClassification = (typeof FINDING_CLASSIFICATIONS)[number];

export const FINDING_RECORD_KINDS = [
  'statement',
  'classification',
  'response',
  'plan_judgment',
  'verification',
] as const;
export type FindingRecordKind = (typeof FINDING_RECORD_KINDS)[number];

export const FINDING_STATUSES = [
  'no_action_required',
  'awaiting_response',
  'awaiting_plan_judgment',
  'plan_inadequate',
  'plan_adequate',
  'verified_effective',
  'verified_not_effective',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** The server's bounds for Finding records. */
export const FINDING_LIMITS = {
  clause: 40,
  area: 300,
  statement: 4000,
  responseText: 4000,
  note: 2000,
  evidence: 10,
} as const;

export interface FindingStatement {
  /** Absent only for an opportunity for improvement. */
  clause: string | null;
  area: string | null;
  statement: string;
  /** Attachments of the Case, at most ten, each once. */
  evidenceAttachmentIds: string[];
}

export type ClassifiedBy = 'team_leader' | 'approver';

export interface FindingClassificationRecord {
  classification: FindingClassification;
  by: ClassifiedBy;
}

export interface NonconformityResponse {
  correction: string;
  cause: string;
  correctiveAction: string;
  receivedOn: string;
  plannedCompletionOn: string | null;
  evidenceAttachmentIds: string[];
}

export type PlanOutcome = 'adequate' | 'inadequate';

export interface PlanJudgment {
  outcome: PlanOutcome;
  note: string;
}

export type VerificationMethod = 'document_review' | 'on_site';
export type VerificationOutcome = 'effective' | 'not_effective';

export interface NonconformityVerification {
  verifiedOn: string;
  method: VerificationMethod;
  outcome: VerificationOutcome;
  note: string;
  evidenceAttachmentIds: string[];
}

interface FindingRecordBase {
  id: string;
  version: number;
  caseRevision: number;
  /** Stated by a later statement or classification version only. */
  reason: string | null;
  recordedBy: CertificationActorReference;
  recordedAt: string;
}

export type FindingRecord =
  | (FindingRecordBase & { kind: 'statement'; value: FindingStatement })
  | (FindingRecordBase & {
      kind: 'classification';
      value: FindingClassificationRecord;
    })
  | (FindingRecordBase & { kind: 'response'; value: NonconformityResponse })
  | (FindingRecordBase & { kind: 'plan_judgment'; value: PlanJudgment })
  | (FindingRecordBase & {
      kind: 'verification';
      value: NonconformityVerification;
    });

/** One Finding as the server derives it from its records, in Case order. */
export interface Finding {
  id: string;
  stage: AuditStage;
  sequence: number;
  statement: FindingStatement;
  classification: FindingClassification;
  status: FindingStatus;
  /** The server's response due date of a nonconformity, shown as is. */
  responseDueOn: string | null;
  /** The server's six-month limit, shown as is. */
  limitOn: string | null;
  /** The server's statement that the six-month limit has passed. */
  overdue: boolean;
  records: FindingRecord[];
}

export function isNonconformity(classification: FindingClassification) {
  return (
    classification === 'major_nonconformity' ||
    classification === 'minor_nonconformity'
  );
}

/** Area of concern belongs to Stage 1 only; the other classes to both Stages. */
export function stageClassifications(
  stage: AuditStage,
): readonly FindingClassification[] {
  return FINDING_CLASSIFICATIONS.filter(
    (classification) =>
      classification !== 'area_of_concern' || stage === 'stage_1',
  );
}

export type ClassificationRefusal =
  'clauseRequired' | 'classificationStage' | 'evidenceRequired';

/**
 * Why the server would refuse this classification of this statement in this
 * Stage, in its order: clause and area, the Stage, then the evidence.
 */
export function classificationRefusal(
  classification: FindingClassification,
  stage: AuditStage,
  statement: FindingStatement,
): ClassificationRefusal | null {
  if (
    classification !== 'opportunity_for_improvement' &&
    (statement.clause === null || statement.area === null)
  )
    return 'clauseRequired';
  if (!stageClassifications(stage).includes(classification))
    return 'classificationStage';
  if (
    isNonconformity(classification) &&
    statement.evidenceAttachmentIds.length === 0
  )
    return 'evidenceRequired';
  return null;
}

/** What a Finding still needs before the next step of its Case. */
export type FindingRequirement = 'verifiedEffective' | 'adequatePlan';

/**
 * The server's rule: a Stage 1 or major nonconformity holds the next step
 * until verified effective; a minor Stage 2 one until its plan is adequate.
 */
export function findingRequirement(
  finding: Pick<Finding, 'stage' | 'classification' | 'status'>,
): FindingRequirement | null {
  const { stage, classification, status } = finding;
  if (!isNonconformity(classification)) return null;
  if (classification === 'major_nonconformity' || stage === 'stage_1')
    return status === 'verified_effective' ? null : 'verifiedEffective';
  return status === 'plan_adequate' || status === 'verified_effective'
    ? null
    : 'adequatePlan';
}

export function findingBlocks(
  finding: Pick<Finding, 'stage' | 'classification' | 'status'>,
): boolean {
  return findingRequirement(finding) !== null;
}

/** A nonconformity receives a response until it is verified effective. */
export function acceptsResponse(
  finding: Pick<Finding, 'classification' | 'status'>,
): boolean {
  return (
    isNonconformity(finding.classification) &&
    finding.status !== 'verified_effective'
  );
}

/** A later version of a Finding that the web offers to record. */
export type FindingCommand =
  | 'response'
  | 'planJudgment'
  | 'verification'
  | 'correction'
  | 'classification'
  | 'reclassification';

/**
 * What an actor may record on a Finding, as the server would accept it: the
 * leader of the approved team follows a nonconformity up in its order and
 * may correct or classify again; an approver linked to no team version may
 * reclassify. The server rechecks every rule.
 */
export function findingCommands(
  finding: Pick<Finding, 'classification' | 'status'>,
  roles: { leader: boolean; independentApprover: boolean },
): FindingCommand[] {
  const commands: FindingCommand[] = [];
  if (roles.leader) {
    if (acceptsResponse(finding)) commands.push('response');
    if (finding.status === 'awaiting_plan_judgment')
      commands.push('planJudgment');
    if (finding.status === 'plan_adequate') commands.push('verification');
    commands.push('correction', 'classification');
  }
  if (roles.independentApprover) commands.push('reclassification');
  return commands;
}

/** The content and status the server derives, or undefined when refused. */
export type FindingReplay = {
  statement: FindingStatement;
  classification: FindingClassification;
  status: FindingStatus;
};

/**
 * Replays records in Case order as the server does, refusing a follow-up
 * record the server would not have accepted in the state it reached.
 */
export function replayFinding(
  records: readonly FindingRecord[],
): FindingReplay | undefined {
  let statement: FindingStatement | undefined;
  let classification: FindingClassification | undefined;
  let status: FindingStatus = 'no_action_required';
  for (const record of records) {
    switch (record.kind) {
      case 'statement':
        statement = record.value;
        break;
      case 'classification': {
        const wasNonconformity =
          classification !== undefined && isNonconformity(classification);
        classification = record.value.classification;
        if (!isNonconformity(classification)) status = 'no_action_required';
        else if (!wasNonconformity) status = 'awaiting_response';
        break;
      }
      case 'response':
        if (
          classification === undefined ||
          !acceptsResponse({ classification, status })
        )
          return undefined;
        status = 'awaiting_plan_judgment';
        break;
      case 'plan_judgment':
        if (status !== 'awaiting_plan_judgment') return undefined;
        status =
          record.value.outcome === 'adequate'
            ? 'plan_adequate'
            : 'plan_inadequate';
        break;
      case 'verification':
        if (status !== 'plan_adequate') return undefined;
        status =
          record.value.outcome === 'effective'
            ? 'verified_effective'
            : 'verified_not_effective';
        break;
      default:
        return unexpected(record);
    }
  }
  return statement && classification
    ? { statement, classification, status }
    : undefined;
}

/** Every attachment a record cites as evidence. */
export function recordEvidence(record: FindingRecord): readonly string[] {
  switch (record.kind) {
    case 'statement':
    case 'response':
    case 'verification':
      return record.value.evidenceAttachmentIds;
    case 'classification':
    case 'plan_judgment':
      return [];
  }
  return unexpected(record);
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification Finding value: ${String(value)}`);
}
