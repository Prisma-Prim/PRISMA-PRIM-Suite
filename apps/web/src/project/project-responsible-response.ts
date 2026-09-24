export type ResponsibleMember = {
  workspaceMembershipId: string;
  displayLabel: string;
};
export type ProjectResponsibility = {
  responsible: ResponsibleMember | null;
  revision: number;
  lastChange: { actorDisplayName: string; occurredAt: string } | null;
  mutable: boolean;
};
export type ResponsibilityReceipt = {
  projectId: string;
  outcome: 'changed' | 'unchanged';
  revision: number;
  responsible: ResponsibleMember | null;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid responsible member response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Invalid responsible member text');
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid responsible member revision');
  return value;
}
function timestamp(value: unknown): string {
  const result = text(value);
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== result)
    throw new Error('Invalid responsible member time');
  return result;
}
function member(value: unknown): ResponsibleMember {
  const row = record(value);
  return {
    workspaceMembershipId: text(row.workspaceMembershipId),
    displayLabel: text(row.displayLabel),
  };
}
function optionalMember(value: unknown): ResponsibleMember | null {
  return value === null ? null : member(value);
}

export function readResponsibility(value: unknown): ProjectResponsibility {
  const row = record(value);
  if (typeof row.mutable !== 'boolean')
    throw new Error('Invalid responsible member state');
  const current = {
    responsible: optionalMember(row.responsible),
    revision: revision(row.revision),
    mutable: row.mutable,
  };
  // Revision 0 means no responsible member was ever named.
  if (current.revision === 0) {
    if (current.responsible !== null || row.lastChange !== null)
      throw new Error('Invalid initial responsible member');
    return { ...current, lastChange: null };
  }
  const lastChange = record(row.lastChange);
  return {
    ...current,
    lastChange: {
      actorDisplayName: text(lastChange.actorDisplayName),
      occurredAt: timestamp(lastChange.occurredAt),
    },
  };
}

export function readResponsibleCandidates(value: unknown): ResponsibleMember[] {
  const row = record(value);
  if (!Array.isArray(row.members))
    throw new Error('Invalid eligible responsible members');
  return row.members.map((entry: unknown) => member(entry));
}

export function readResponsibilityReceipt(
  value: unknown,
  projectId: string,
): ResponsibilityReceipt {
  const row = record(value);
  if (row.projectId !== projectId)
    throw new Error('Invalid responsible member receipt');
  if (row.outcome !== 'changed' && row.outcome !== 'unchanged')
    throw new Error('Invalid responsible member outcome');
  return {
    projectId,
    outcome: row.outcome,
    revision: revision(row.revision),
    responsible: optionalMember(row.responsible),
  };
}
