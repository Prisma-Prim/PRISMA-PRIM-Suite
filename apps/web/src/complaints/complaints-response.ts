// Scratch proposal only. Public journal response shapes still require REST proof.
export interface ComplaintIntake {
  complaintDate: string | null;
  complainant: string;
  subject: string;
  severityDescription: string | null;
  responseDueDate: string | null;
}

interface Attribution {
  workspaceMembershipId: string;
  displayLabel: string;
}

interface ComplaintBase {
  id: string;
  workspaceId: string;
  companyId: string;
  clientAccountId: string;
  clientDisplayName: string;
  responsible: Attribution;
  revision: number;
  createdAt: string;
  originalIntake: ComplaintIntake;
  currentIntake: ComplaintIntake;
}

export type Complaint = ComplaintBase &
  (
    | { projectId: null; project: null }
    | { projectId: string; project: { id: string; title: string } }
  );

interface HistoryBase {
  id: string;
  revision: number;
  actor: Attribution;
  recordedAt: string;
}

type JournalOriginal = HistoryBase & {
  kind: 'action' | 'response';
  text: string;
  declaredDate: string | null;
};

export type ComplaintHistoryEntry = HistoryBase &
  (
    | { kind: 'intake'; intake: ComplaintIntake; reason: null }
    | { kind: 'intake_correction'; intake: ComplaintIntake; reason: string }
    | (JournalOriginal & { corrected: boolean })
    | {
        kind: 'correction';
        originalEntryId: string;
        originalKind: 'action' | 'response';
        original: JournalOriginal;
        text: string;
        declaredDate: string | null;
        reason: string;
      }
  );

export interface ComplaintPage {
  companyId: string;
  complaints: Complaint[];
  total: number;
  offset: number;
  pageSize: 25;
}

export interface ComplaintHistory {
  complaintId: string;
  companyId: string;
  revision: number;
  entries: ComplaintHistoryEntry[];
  total: number;
  offset: number;
  pageSize: 25;
}

export function complaintCalendarDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !value.startsWith('0000-') &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}

export function parseComplaint({
  value,
  companyId,
  workspaceId,
}: {
  value: unknown;
  companyId: string;
  workspaceId: string;
}): Complaint {
  const input = object(value);
  if (input.companyId !== companyId || input.workspaceId !== workspaceId)
    throw new Error('Complaint scope does not match the current context.');
  const base = {
    id: text(input.id),
    companyId,
    workspaceId,
    clientAccountId: text(input.clientAccountId),
    clientDisplayName: text(input.clientDisplayName),
    responsible: attribution(input.responsible),
    revision: integer(input.revision, 1),
    createdAt: timestamp(input.createdAt),
    originalIntake: parseComplaintIntake(input.originalIntake),
    currentIntake: parseComplaintIntake(input.currentIntake),
  };
  if (input.projectId === null && input.project === null)
    return { ...base, projectId: null, project: null };
  const project = object(input.project);
  const projectId = text(input.projectId);
  if (project.id !== projectId)
    throw new Error('Complaint Project does not match.');
  return {
    ...base,
    projectId,
    project: { id: projectId, title: text(project.title) },
  };
}

export function parseComplaintPage({
  value,
  companyId,
  workspaceId,
  offset,
}: {
  value: unknown;
  companyId: string;
  workspaceId: string;
  offset: number;
}): ComplaintPage {
  const input = object(value);
  if (
    input.companyId !== companyId ||
    input.offset !== offset ||
    input.pageSize !== 25 ||
    !Array.isArray(input.complaints) ||
    input.complaints.length > 25
  )
    throw new Error('Invalid bounded Complaint page.');
  const complaints = input.complaints.map((row: unknown) =>
    parseComplaint({ value: row, companyId, workspaceId }),
  );
  const total = integer(input.total, 0);
  if (
    complaints.length > Math.max(0, total - offset) ||
    new Set(complaints.map((row) => row.id)).size !== complaints.length
  )
    throw new Error('Invalid Complaint count or duplicate row.');
  return { companyId, complaints, total, offset, pageSize: 25 };
}

export function parseComplaintHistory({
  value,
  complaint,
  offset,
}: {
  value: unknown;
  complaint: Complaint;
  offset: number;
}): ComplaintHistory {
  const input = object(value);
  if (
    input.complaintId !== complaint.id ||
    input.companyId !== complaint.companyId ||
    input.revision !== complaint.revision ||
    input.offset !== offset ||
    input.pageSize !== 25 ||
    !Array.isArray(input.entries) ||
    input.entries.length > 25
  )
    throw new Error('Complaint changed or returned an invalid history page.');
  const entries = input.entries.map((value: unknown): ComplaintHistoryEntry => {
    const row = object(value);
    const base = {
      id: text(row.id),
      revision: integer(row.revision, 1),
      actor: attribution(row.actor),
      recordedAt: timestamp(row.recordedAt),
    };
    if (base.revision > complaint.revision)
      throw new Error('Invalid future Complaint history revision.');
    switch (row.kind) {
      case 'intake':
        if (row.reason !== null || base.revision !== 1)
          throw new Error('Invalid original Complaint intake.');
        return {
          ...base,
          kind: 'intake',
          intake: parseComplaintIntake(row.intake),
          reason: null,
        };
      case 'intake_correction':
        return {
          ...base,
          kind: 'intake_correction',
          intake: parseComplaintIntake(row.intake),
          reason: text(row.reason, 1000),
        };
      case 'action':
      case 'response':
        if (typeof row.corrected !== 'boolean')
          throw new Error('Invalid original Complaint correction marker.');
        return {
          ...base,
          kind: row.kind,
          text: text(row.text, 5000),
          declaredDate: calendarOrNull(row.declaredDate),
          corrected: row.corrected,
        };
      case 'correction': {
        if (row.originalKind !== 'action' && row.originalKind !== 'response')
          throw new Error('Invalid original Complaint journal kind.');
        const original = object(row.original);
        if (
          original.id !== row.originalEntryId ||
          original.kind !== row.originalKind
        )
          throw new Error(
            'Complaint correction does not identify its original.',
          );
        const originalRevision = integer(original.revision, 1);
        if (originalRevision >= base.revision)
          throw new Error('Complaint correction must follow its original.');
        return {
          ...base,
          kind: 'correction',
          originalEntryId: text(row.originalEntryId),
          originalKind: row.originalKind,
          original: {
            id: text(original.id),
            kind: row.originalKind,
            revision: originalRevision,
            actor: attribution(original.actor),
            recordedAt: timestamp(original.recordedAt),
            text: text(original.text, 5000),
            declaredDate: calendarOrNull(original.declaredDate),
          },
          text: text(row.text, 5000),
          declaredDate: calendarOrNull(row.declaredDate),
          reason: text(row.reason, 1000),
        };
      }
      default:
        throw new Error('Unknown Complaint history entry.');
    }
  });
  const total = integer(input.total, 0);
  if (
    entries.length > Math.max(0, total - offset) ||
    new Set(entries.map((row) => row.id)).size !== entries.length
  )
    throw new Error('Invalid Complaint history count or duplicate entry.');
  return {
    companyId: complaint.companyId,
    complaintId: complaint.id,
    revision: complaint.revision,
    entries,
    total,
    offset,
    pageSize: 25,
  };
}

export function parseComplaintIntake(value: unknown): ComplaintIntake {
  const input = object(value);
  return {
    complaintDate: calendarOrNull(input.complaintDate),
    complainant: text(input.complainant, 300),
    subject: text(input.subject, 5000),
    severityDescription:
      input.severityDescription === null
        ? null
        : text(input.severityDescription, 1000),
    responseDueDate: calendarOrNull(input.responseDueDate),
  };
}

export function parseClientChoices(
  value: unknown,
): { id: string; displayName: string }[] {
  if (!Array.isArray(value)) throw new Error('Invalid Client choices.');
  return value.flatMap((item: unknown) => {
    const row = object(item);
    if (typeof row.relatedToActiveCompany !== 'boolean')
      throw new Error('Invalid Client relationship hint.');
    return row.relatedToActiveCompany
      ? [{ id: text(row.id), displayName: text(row.displayName) }]
      : [];
  });
}

export function parseProjectChoices({
  value,
  companyId,
  clientAccountId,
}: {
  value: unknown;
  companyId: string;
  clientAccountId: string;
}): { id: string; title: string }[] {
  if (!Array.isArray(value)) throw new Error('Invalid Project choices.');
  return value.flatMap((item: unknown) => {
    const row = object(item);
    if (row.companyId !== companyId)
      throw new Error('Project scope does not match.');
    // Project's owner has already decided readability. Completed Projects remain eligible.
    return text(row.clientAccountId) === clientAccountId
      ? [{ id: text(row.id), title: text(row.title) }]
      : [];
  });
}

function attribution(value: unknown): Attribution {
  const input = object(value);
  return {
    workspaceMembershipId: text(input.workspaceMembershipId),
    displayLabel: text(input.displayLabel),
  };
}
function calendarOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (!complaintCalendarDate(value))
    throw new Error('Invalid declared Complaint date.');
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a Complaint object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown, maximum = 5000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error('Invalid Complaint text.');
  return value;
}
function integer(value: unknown, minimum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > 2147483647
  )
    throw new Error('Invalid Complaint integer.');
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new Error('Invalid Complaint recording time.');
  return value;
}
