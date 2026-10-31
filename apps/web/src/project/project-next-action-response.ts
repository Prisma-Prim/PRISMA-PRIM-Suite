export interface NextActionScope {
  workspaceId: string;
  companyId: string;
  projectId: string;
  originalClientAccountId: string;
}
export interface NextActionAttribution {
  internalUserId: string;
  workspaceMembershipId: string;
  displayName: string;
  occurredAt: string;
}
export type NextActionRecord = NextActionScope & {
  format: 'project-next-action-v1';
  revision: number;
  text: string | null;
  lastChange: NextActionAttribution | null;
};
export interface NextActionHistoryEntry {
  revision: number;
  predecessorRevision: number;
  before: string | null;
  after: string | null;
  attribution: NextActionAttribution;
}
export interface NextActionSnapshot {
  current: NextActionRecord;
  history: {
    entries: NextActionHistoryEntry[];
    hasMore: boolean;
    nextBeforeRevision: number | null;
  };
}
export interface NextActionIntent {
  expectedRevision: number;
  expectedLifecycleRevision: number;
  text: string | null;
}
export interface NextActionReceipt {
  format: 'project-next-action-command-v1';
  outcome: 'changed' | 'unchanged';
  record: NextActionRecord;
}
function invalid(): never {
  throw new Error('Invalid Project next-action representation.');
}
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const entries = Object.entries(value);
  if (
    entries.length !== fields.length ||
    entries.some(([key]) => !fields.includes(key))
  )
    invalid();
  return Object.fromEntries(entries);
}
function revision(value: unknown, min = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > 2147483647
  )
    invalid();
  return value;
}
function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      value,
    )
  )
    invalid();
  return value;
}
export function normalizeNextActionText(value: string): string | null {
  for (const scalar of value) {
    const code = scalar.codePointAt(0);
    if (code === 0 || (code !== undefined && code >= 0xd800 && code <= 0xdfff))
      invalid();
  }
  const normalized = value.trim();
  if ([...normalized].length > 500) invalid();
  return normalized.length === 0 ? null : normalized;
}
function text(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || normalizeNextActionText(value) !== value)
    invalid();
  return value;
}
function attribution(value: unknown): NextActionAttribution {
  const row = object(value, [
    'internalUserId',
    'workspaceMembershipId',
    'displayName',
    'occurredAt',
  ]);
  if (
    typeof row.displayName !== 'string' ||
    typeof row.occurredAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(row.occurredAt) ||
    !Number.isFinite(Date.parse(row.occurredAt)) ||
    new Date(row.occurredAt).toISOString() !== row.occurredAt
  )
    invalid();
  return {
    internalUserId: uuid(row.internalUserId),
    workspaceMembershipId: uuid(row.workspaceMembershipId),
    displayName: row.displayName,
    occurredAt: row.occurredAt,
  };
}
function record(
  value: unknown,
  scope: NextActionScope,
): NextActionRecord | undefined {
  if (
    value &&
    typeof value === 'object' &&
    'format' in value &&
    typeof value.format === 'string' &&
    value.format !== 'project-next-action-v1'
  )
    return undefined;
  const row = object(value, [
    'format',
    'workspaceId',
    'companyId',
    'projectId',
    'originalClientAccountId',
    'revision',
    'text',
    'lastChange',
  ]);
  if (row.format !== 'project-next-action-v1') invalid();
  for (const [key, id] of Object.entries(scope))
    if (uuid(row[key]) !== id) invalid();
  const rev = revision(row.revision),
    content = text(row.text);
  if (rev === 0) {
    if (content !== null || row.lastChange !== null) invalid();
    return {
      format: 'project-next-action-v1',
      ...scope,
      revision: 0,
      text: null,
      lastChange: null,
    };
  }
  return {
    format: 'project-next-action-v1',
    ...scope,
    revision: rev,
    text: content,
    lastChange: attribution(row.lastChange),
  };
}
export function readNextAction(
  value: unknown,
  scope: NextActionScope,
  before?: number,
): NextActionSnapshot | undefined {
  const row = object(value, ['current', 'history']),
    current = record(row.current, scope);
  if (!current) return undefined;
  const history = object(row.history, [
    'entries',
    'hasMore',
    'nextBeforeRevision',
  ]);
  if (
    !Array.isArray(history.entries) ||
    history.entries.length > 25 ||
    typeof history.hasMore !== 'boolean'
  )
    invalid();
  const entries = history.entries.map((value: unknown) => {
    const fact = object(value, [
      'revision',
      'predecessorRevision',
      'before',
      'after',
      'attribution',
    ]);
    const rev = revision(fact.revision, 1),
      predecessor = revision(fact.predecessorRevision),
      previous = text(fact.before),
      after = text(fact.after);
    if (
      predecessor !== rev - 1 ||
      previous === after ||
      (rev === 1 && previous !== null) ||
      rev > current.revision ||
      (before !== undefined && rev >= before)
    )
      invalid();
    return {
      revision: rev,
      predecessorRevision: predecessor,
      before: previous,
      after,
      attribution: attribution(fact.attribution),
    };
  });
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i],
      older = entries[i + 1];
    if (
      entry &&
      older &&
      (entry.predecessorRevision !== older.revision ||
        entry.before !== older.after)
    )
      invalid();
  }
  const first = entries[0],
    last = entries.at(-1),
    selectedRevision =
      before === undefined
        ? current.revision
        : Math.min(current.revision, before - 1);
  if (
    (selectedRevision === 0
      ? entries.length !== 0
      : !first || first.revision !== selectedRevision) ||
    (first?.revision === current.revision &&
      (first.after !== current.text ||
        JSON.stringify(first.attribution) !==
          JSON.stringify(current.lastChange)))
  )
    invalid();
  if (
    history.hasMore
      ? entries.length !== 25 ||
        !last ||
        last.revision <= 1 ||
        history.nextBeforeRevision !== last.revision
      : history.nextBeforeRevision !== null || (last && last.revision !== 1)
  )
    invalid();
  return {
    current,
    history: {
      entries,
      hasMore: history.hasMore,
      nextBeforeRevision: history.hasMore && last ? last.revision : null,
    },
  };
}
export function readNextActionReceipt(
  value: unknown,
  scope: NextActionScope,
  intent: NextActionIntent,
): NextActionReceipt | undefined {
  if (
    value &&
    typeof value === 'object' &&
    'format' in value &&
    typeof value.format === 'string' &&
    value.format !== 'project-next-action-command-v1'
  )
    return undefined;
  const row = object(value, ['format', 'outcome', 'record']);
  if (
    row.format !== 'project-next-action-command-v1' ||
    (row.outcome !== 'changed' && row.outcome !== 'unchanged')
  )
    invalid();
  const saved = record(row.record, scope);
  if (!saved) return undefined;
  if (
    saved.text !== intent.text ||
    saved.revision !==
      intent.expectedRevision + (row.outcome === 'changed' ? 1 : 0)
  )
    invalid();
  return {
    format: 'project-next-action-command-v1',
    outcome: row.outcome,
    record: saved,
  };
}
