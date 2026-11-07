import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import type { AuditStage } from './certification-stages.js';
import { calendarDate, inputObject } from './certification.validation.js';

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

export interface FindingStatement {
  /** Required except for an opportunity for improvement. */
  clause: string | null;
  area: string | null;
  statement: string;
  evidenceAttachmentIds: string[];
}

export interface FindingClassificationRecord {
  classification: FindingClassification;
  by: 'team_leader' | 'approver';
}

export interface NonconformityResponse {
  correction: string;
  cause: string;
  correctiveAction: string;
  receivedOn: string;
  plannedCompletionOn: string | null;
  evidenceAttachmentIds: string[];
}

export interface PlanJudgment {
  outcome: 'adequate' | 'inadequate';
  note: string;
}

export interface NonconformityVerification {
  verifiedOn: string;
  method: 'document_review' | 'on_site';
  outcome: 'effective' | 'not_effective';
  note: string;
  evidenceAttachmentIds: string[];
}

export type FindingStatus =
  | 'no_action_required'
  | 'awaiting_response'
  | 'awaiting_plan_judgment'
  | 'plan_inadequate'
  | 'plan_adequate'
  | 'verified_effective'
  | 'verified_not_effective';

export function isNonconformity(classification: FindingClassification) {
  return (
    classification === 'major_nonconformity' ||
    classification === 'minor_nonconformity'
  );
}

/** Area of concern belongs to Stage 1 only; the other classes to both Stages. */
export function allowedInStage(
  classification: FindingClassification,
  stage: AuditStage,
): boolean {
  return classification !== 'area_of_concern' || stage === 'stage_1';
}

export function findingStatement(value: unknown): FindingStatement {
  const body = inputObject(value, [
    'clause',
    'area',
    'statement',
    'evidenceAttachmentIds',
  ]);
  return {
    clause: optionalText(body.clause, 40),
    area: optionalText(body.area, 300),
    statement: text(body.statement, 4000),
    evidenceAttachmentIds: attachments(body.evidenceAttachmentIds),
  };
}

export function findingClassification(
  value: unknown,
): FindingClassificationRecord {
  const body = inputObject(value, ['classification', 'by']);
  if (body.by !== 'team_leader' && body.by !== 'approver') return invalid();
  return { classification: classification(body.classification), by: body.by };
}

export function nonconformityResponse(value: unknown): NonconformityResponse {
  const body = inputObject(value, [
    'correction',
    'cause',
    'correctiveAction',
    'receivedOn',
    'plannedCompletionOn',
    'evidenceAttachmentIds',
  ]);
  return {
    correction: text(body.correction, 4000),
    cause: text(body.cause, 4000),
    correctiveAction: text(body.correctiveAction, 4000),
    receivedOn: date(body.receivedOn),
    plannedCompletionOn:
      body.plannedCompletionOn === undefined ||
      body.plannedCompletionOn === null
        ? null
        : date(body.plannedCompletionOn),
    evidenceAttachmentIds: attachments(body.evidenceAttachmentIds ?? []),
  };
}

export function planJudgment(value: unknown): PlanJudgment {
  const body = inputObject(value, ['outcome', 'note']);
  if (body.outcome !== 'adequate' && body.outcome !== 'inadequate')
    return invalid();
  return { outcome: body.outcome, note: text(body.note, 2000) };
}

export function nonconformityVerification(
  value: unknown,
): NonconformityVerification {
  const body = inputObject(value, [
    'verifiedOn',
    'method',
    'outcome',
    'note',
    'evidenceAttachmentIds',
  ]);
  if (body.method !== 'document_review' && body.method !== 'on_site')
    return invalid();
  if (body.outcome !== 'effective' && body.outcome !== 'not_effective')
    return invalid();
  return {
    verifiedOn: date(body.verifiedOn),
    method: body.method,
    outcome: body.outcome,
    note: text(body.note, 2000),
    evidenceAttachmentIds: attachments(body.evidenceAttachmentIds ?? []),
  };
}

/** Splits `{expectedRevision, reason?, ...payload}` and validates the payload. */
export function findingCommand<T>(
  value: unknown,
  parse: (payload: unknown) => T,
): { expectedRevision: number; reason: string | null; payload: T } {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  const { expectedRevision, reason, ...payload } = Object.fromEntries(
    Object.entries(value),
  );
  if (
    typeof expectedRevision !== 'number' ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1 ||
    expectedRevision > 2147483646
  )
    return invalid();
  return {
    expectedRevision,
    reason: reason === undefined || reason === null ? null : text(reason, 2000),
    payload: parse(payload),
  };
}

export function classification(value: unknown): FindingClassification {
  const match = FINDING_CLASSIFICATIONS.find((entry) => entry === value);
  if (!match) return invalid();
  return match;
}

/** Calendar arithmetic on ISO dates, in UTC. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

function attachments(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10) return invalid();
  const ids = value.map(requireUuid);
  if (new Set(ids).size !== ids.length) return invalid();
  return ids;
}

function date(value: unknown): string {
  if (!calendarDate(value)) return invalid();
  return value;
}

function optionalText(value: unknown, limit: number): string | null {
  return value === undefined || value === null ? null : text(value, limit);
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    return invalid();
  return value;
}

export function findingRule(code: string, message: string) {
  return new BadRequestException({ code, message });
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}

export interface FindingRecordRow {
  id: string;
  kind: FindingRecordKind;
  version: number;
  caseRevision: number;
  payload: unknown;
  reason: string | null;
  actorMembershipId: string;
  actorDisplayName: string;
  recordedAt: Date;
}

interface RecordBase {
  id: string;
  version: number;
  caseRevision: number;
  reason: string | null;
  recordedBy: { workspaceMembershipId: string; displayName: string };
  recordedAt: string;
}

export type FindingRecordView =
  | (RecordBase & { kind: 'statement'; value: FindingStatement })
  | (RecordBase & {
      kind: 'classification';
      value: FindingClassificationRecord;
    })
  | (RecordBase & { kind: 'response'; value: NonconformityResponse })
  | (RecordBase & { kind: 'plan_judgment'; value: PlanJudgment })
  | (RecordBase & { kind: 'verification'; value: NonconformityVerification });

export interface FindingView {
  id: string;
  stage: AuditStage;
  sequence: number;
  statement: FindingStatement;
  classification: FindingClassification;
  status: FindingStatus;
  responseDueOn: string | null;
  limitOn: string | null;
  overdue: boolean;
  records: FindingRecordView[];
}

export function findingRecordView(row: FindingRecordRow): FindingRecordView {
  const base: RecordBase = {
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
  switch (row.kind) {
    case 'statement':
      return {
        ...base,
        kind: 'statement',
        value: findingStatement(row.payload),
      };
    case 'classification':
      return {
        ...base,
        kind: 'classification',
        value: findingClassification(row.payload),
      };
    case 'response':
      return {
        ...base,
        kind: 'response',
        value: nonconformityResponse(row.payload),
      };
    case 'plan_judgment':
      return {
        ...base,
        kind: 'plan_judgment',
        value: planJudgment(row.payload),
      };
    case 'verification':
      return {
        ...base,
        kind: 'verification',
        value: nonconformityVerification(row.payload),
      };
  }
  return unexpectedKind(row.kind);
}

/**
 * The current content and follow-up status of a Finding, replayed from its
 * records in Case order. `stageEnd` is the last planned day of its Stage.
 */
export function findingView(input: {
  id: string;
  stage: AuditStage;
  sequence: number;
  stageEnd: string;
  today: string;
  records: readonly FindingRecordView[];
}): FindingView {
  const ordered = [...input.records].sort(
    (left, right) =>
      left.caseRevision - right.caseRevision || left.version - right.version,
  );
  let statement: FindingStatement | undefined;
  let current: FindingClassification | undefined;
  let status: FindingStatus = 'no_action_required';
  for (const record of ordered) {
    switch (record.kind) {
      case 'statement':
        statement = record.value;
        break;
      case 'classification': {
        const wasNonconformity =
          current !== undefined && isNonconformity(current);
        current = record.value.classification;
        if (!isNonconformity(current)) status = 'no_action_required';
        else if (!wasNonconformity) status = 'awaiting_response';
        break;
      }
      case 'response':
        status = 'awaiting_plan_judgment';
        break;
      case 'plan_judgment':
        status =
          record.value.outcome === 'adequate'
            ? 'plan_adequate'
            : 'plan_inadequate';
        break;
      case 'verification':
        status =
          record.value.outcome === 'effective'
            ? 'verified_effective'
            : 'verified_not_effective';
        break;
    }
  }
  if (!statement || !current)
    throw new Error('A Finding needs a statement and a classification.');
  const nonconformity = isNonconformity(current);
  const limited =
    nonconformity &&
    (input.stage === 'stage_1' || current === 'major_nonconformity');
  const limitOn = limited ? addMonths(input.stageEnd, 6) : null;
  return {
    id: input.id,
    stage: input.stage,
    sequence: input.sequence,
    statement,
    classification: current,
    status,
    responseDueOn: nonconformity ? addDays(input.stageEnd, 14) : null,
    limitOn,
    overdue:
      limitOn !== null &&
      status !== 'verified_effective' &&
      input.today > limitOn,
    records: ordered,
  };
}

/** Whether a Finding still blocks the next step of its Case. */
export function findingBlocks(view: FindingView): boolean {
  if (view.classification === 'major_nonconformity' || view.stage === 'stage_1')
    return (
      isNonconformity(view.classification) &&
      view.status !== 'verified_effective'
    );
  if (view.classification === 'minor_nonconformity')
    return (
      view.status !== 'plan_adequate' && view.status !== 'verified_effective'
    );
  return false;
}

function unexpectedKind(value: never): never {
  throw new Error(`Unexpected Finding record ${String(value)}`);
}
