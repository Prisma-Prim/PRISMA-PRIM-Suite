import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { calendarDate, inputObject } from './certification.validation.js';
import {
  optionalAttribution,
  type ActAttribution,
} from './certification-attribution.js';

export type AuditStage = 'stage_1' | 'stage_2';

export interface StagePlan {
  startDate: string;
  endDate: string;
  onSiteDays: string;
  remoteDays: string;
  objectives: string;
  scope: string;
  planAttachmentId: string;
  sentToClientOn: string | null;
  deviationNote: string | null;
}

export interface Stage1Report {
  reportDate: string;
  documentReviewCompleted: true;
  conclusion: 'ready' | 'not_ready';
  conclusionNote: string;
  reportAttachmentId: string;
  participantListAttachmentId: string | null;
  /** The certification body's approval of the report, when recorded on its behalf. */
  certificationBodyApproval: ActAttribution | null;
}

export interface Stage2Report {
  reportDate: string;
  summary: string;
  reportAttachmentId: string;
  participantListAttachmentId: string | null;
  annexAttachmentId: string | null;
  certificationBodyApproval: ActAttribution | null;
}

const PLAN_FIELDS = [
  'startDate',
  'endDate',
  'onSiteDays',
  'remoteDays',
  'objectives',
  'scope',
  'planAttachmentId',
  'sentToClientOn',
  'deviationNote',
] as const;

/** Validates both submitted and persisted Stage plans. */
export function stagePlan(value: unknown): StagePlan {
  const body = inputObject(value, PLAN_FIELDS);
  const plan: StagePlan = {
    startDate: date(body.startDate),
    endDate: date(body.endDate),
    onSiteDays: days(body.onSiteDays, false),
    remoteDays: days(body.remoteDays ?? '0', true),
    objectives: text(body.objectives, 2000),
    scope: text(body.scope, 2000),
    planAttachmentId: requireUuid(body.planAttachmentId),
    sentToClientOn:
      body.sentToClientOn === undefined || body.sentToClientOn === null
        ? null
        : date(body.sentToClientOn),
    deviationNote: optionalText(body.deviationNote, 2000),
  };
  if (plan.startDate > plan.endDate)
    throw rule(
      'CERTIFICATION_STAGE_DATES',
      'A Stage ends on or after its start.',
    );
  return plan;
}

/** Validates both submitted and persisted Stage 1 reports. */
export function stage1Report(value: unknown): Stage1Report {
  const body = inputObject(value, [
    'reportDate',
    'documentReviewCompleted',
    'conclusion',
    'conclusionNote',
    'reportAttachmentId',
    'participantListAttachmentId',
    'certificationBodyApproval',
  ]);
  if (body.documentReviewCompleted !== true)
    throw rule(
      'CERTIFICATION_DOCUMENT_REVIEW_INCOMPLETE',
      'The document review is completed within Stage 1.',
    );
  if (body.conclusion !== 'ready' && body.conclusion !== 'not_ready')
    return invalid();
  return {
    reportDate: date(body.reportDate),
    documentReviewCompleted: true,
    conclusion: body.conclusion,
    conclusionNote: text(body.conclusionNote, 4000),
    reportAttachmentId: requireUuid(body.reportAttachmentId),
    participantListAttachmentId: optionalUuid(body.participantListAttachmentId),
    certificationBodyApproval: optionalAttribution(
      body.certificationBodyApproval,
    ),
  };
}

/** Validates both submitted and persisted Stage 2 reports. */
export function stage2Report(value: unknown): Stage2Report {
  const body = inputObject(value, [
    'reportDate',
    'summary',
    'reportAttachmentId',
    'participantListAttachmentId',
    'annexAttachmentId',
    'certificationBodyApproval',
  ]);
  return {
    reportDate: date(body.reportDate),
    summary: text(body.summary, 4000),
    reportAttachmentId: requireUuid(body.reportAttachmentId),
    participantListAttachmentId: optionalUuid(body.participantListAttachmentId),
    annexAttachmentId: optionalUuid(body.annexAttachmentId),
    certificationBodyApproval: optionalAttribution(
      body.certificationBodyApproval,
    ),
  };
}

export function stageCommand<T>(
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
    reason: optionalText(reason, 2000),
    payload: parse(payload),
  };
}

/** Whole hundredths of a day of a validated amount. */
export function dayCents(value: string): number {
  const [whole = '0', fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}

/**
 * Auditor-days with at most two decimals, kept in one spelling ("1.0" and
 * "1" are the same amount) so equal values compare equal.
 */
function days(value: unknown, zeroAllowed: boolean): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/u.test(value) ||
    (!zeroAllowed && dayCents(value) <= 0)
  )
    return invalid();
  const [whole = '0', fraction = ''] = value.split('.');
  const significant = fraction.replace(/0+$/u, '');
  return significant ? `${whole}.${significant}` : whole;
}

function date(value: unknown): string {
  if (!calendarDate(value)) return invalid();
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    return invalid();
  return value;
}

function optionalText(value: unknown, limit: number): string | null {
  return value === undefined || value === null ? null : text(value, limit);
}

function optionalUuid(value: unknown): string | null {
  return value === undefined || value === null ? null : requireUuid(value);
}

function rule(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}
