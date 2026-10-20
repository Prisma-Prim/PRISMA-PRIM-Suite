import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';

export interface ComplaintIntake {
  complaintDate: string | null;
  complainant: string;
  subject: string;
  severityDescription: string | null;
  responseDueDate: string | null;
}

interface ComplaintViewBase {
  id: string;
  workspaceId: string;
  companyId: string;
  clientAccountId: string;
  clientDisplayName: string;
  revision: number;
  createdAt: string;
  responsible: { workspaceMembershipId: string; displayLabel: string };
  originalIntake: ComplaintIntake;
  currentIntake: ComplaintIntake;
}

export type ComplaintView = ComplaintViewBase &
  (
    | { projectId: null; project: null }
    | { projectId: string; project: { id: string; title: string } }
  );

interface ComplaintHistoryAttribution {
  id: string;
  revision: number;
  actor: { workspaceMembershipId: string; displayLabel: string };
  recordedAt: string;
}

export type ComplaintJournalOriginal = ComplaintHistoryAttribution & {
  kind: 'action' | 'response';
  text: string;
  declaredDate: string | null;
};

export type ComplaintHistoryEntry =
  | (ComplaintHistoryAttribution & {
      kind: 'intake';
      intake: ComplaintIntake;
      reason: null;
    })
  | (ComplaintHistoryAttribution & {
      kind: 'intake_correction';
      intake: ComplaintIntake;
      reason: string;
    })
  | (ComplaintJournalOriginal & { corrected: boolean })
  | (ComplaintHistoryAttribution & {
      kind: 'correction';
      text: string;
      declaredDate: string | null;
      reason: string;
      originalEntryId: string;
      originalKind: 'action' | 'response';
      original: ComplaintJournalOriginal;
    });

export interface ComplaintHistoryPage {
  complaintId: string;
  companyId: string;
  revision: number;
  entries: ComplaintHistoryEntry[];
  total: number;
  offset: number;
  pageSize: 25;
}

export function readComplaintOffset(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/u.test(value))
    throw new BadRequestException('A valid Complaint page offset is required.');
  const offset = Number(value);
  if (!Number.isSafeInteger(offset) || offset > 2147483647)
    throw new BadRequestException('A valid Complaint page offset is required.');
  return offset;
}

export function readComplaintRecord(value: unknown) {
  const input = record(value);
  return {
    clientAccountId: requireUuid(input.clientAccountId),
    projectId:
      input.projectId === undefined || input.projectId === null
        ? null
        : requireUuid(input.projectId),
    responsibleMembershipId: requireUuid(input.responsibleMembershipId),
    intake: readComplaintIntake(input),
  };
}

export function readComplaintIntakeCorrection(value: unknown) {
  const input = record(value);
  if (
    typeof input.expectedRevision !== 'number' ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1 ||
    input.expectedRevision > 2147483647
  )
    throw new BadRequestException(
      'The observed Complaint revision is required.',
    );
  return {
    expectedRevision: input.expectedRevision,
    reason: text(input.reason, 1000),
    intake: readComplaintIntake(input),
  };
}

export function readComplaintJournalRecord(value: unknown): Pick<
  ComplaintJournalOriginal,
  'kind' | 'text' | 'declaredDate'
> & {
  expectedRevision: number;
} {
  const input = record(value);
  if (input.kind !== 'action' && input.kind !== 'response')
    throw new BadRequestException('A factual action or response is required.');
  return {
    kind: input.kind,
    ...readComplaintJournalFact(input),
    expectedRevision: expectedRevision(input.expectedRevision),
  };
}

export function readComplaintJournalCorrection(value: unknown): Pick<
  ComplaintJournalOriginal,
  'text' | 'declaredDate'
> & {
  expectedRevision: number;
  reason: string;
} {
  const input = record(value);
  return {
    ...readComplaintJournalFact(input),
    expectedRevision: expectedRevision(input.expectedRevision),
    reason: text(input.reason, 1000),
  };
}

export function readComplaintJournalFact(value: unknown) {
  const input = record(value);
  return {
    text: text(input.text, 5000),
    declaredDate: date(input.declaredDate),
  };
}

function expectedRevision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    throw new BadRequestException(
      'The observed Complaint revision is required.',
    );
  return value;
}

export function readComplaintIntake(value: unknown): ComplaintIntake {
  const input = record(value);
  return {
    complaintDate: date(input.complaintDate),
    complainant: text(input.complainant, 300),
    subject: text(input.subject, 5000),
    severityDescription:
      input.severityDescription === undefined ||
      input.severityDescription === null
        ? null
        : text(input.severityDescription, 1000),
    responseDueDate: date(input.responseDueDate),
  };
}

export function readComplaintReceipt(value: unknown): ComplaintView {
  const input = record(value);
  const responsible = record(input.responsible);
  if (
    !Number.isSafeInteger(input.revision) ||
    typeof input.revision !== 'number' ||
    input.revision < 1
  )
    throw new Error('Invalid persisted Complaint revision.');
  if (
    typeof input.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(input.createdAt))
  )
    throw new Error('Invalid persisted Complaint recording time.');
  const common = {
    id: requireUuid(input.id),
    workspaceId: requireUuid(input.workspaceId),
    companyId: requireUuid(input.companyId),
    clientAccountId: requireUuid(input.clientAccountId),
    clientDisplayName: text(input.clientDisplayName, 5000),
    revision: input.revision,
    createdAt: input.createdAt,
    responsible: {
      workspaceMembershipId: requireUuid(responsible.workspaceMembershipId),
      displayLabel: text(responsible.displayLabel, 5000),
    },
    originalIntake: readComplaintIntake(input.originalIntake),
    currentIntake: readComplaintIntake(input.currentIntake),
  };
  if (input.projectId === null && input.project === null)
    return { ...common, projectId: null, project: null };
  const project = record(input.project);
  const projectId = requireUuid(input.projectId);
  if (projectId !== requireUuid(project.id))
    throw new Error('Invalid persisted Complaint Project.');
  return {
    ...common,
    projectId,
    project: { id: projectId, title: text(project.title, 5000) },
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new BadRequestException('A Complaint object is required.');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new BadRequestException('Complaint text is missing or too long.');
  return value;
}

function date(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value.startsWith('0000-')
  )
    throw new BadRequestException(
      'A valid calendar date or unknown is required.',
    );
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException(
      'A valid calendar date or unknown is required.',
    );
  return value;
}
