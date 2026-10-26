import type { TaskActor } from './task-response';

export interface TaskResultReference {
  documentId: string;
  versionId: string;
  versionNumber: number;
  title: string;
  status: 'official' | 'superseded';
  representationId: string;
}
export type TaskResultDeclaration = {
  id: string;
  revision: number;
  declaration: string;
  actor: TaskActor;
  occurredAt: string;
  reference: TaskResultReference;
} & (
  | { kind: 'recorded' }
  | { kind: 'corrected'; predecessorId: string; reason: string }
);
export type TaskResultSnapshot = {
  taskId: string;
  projectId: string;
  taskTitle: string;
  taskVersion: number;
  mutable: boolean;
} & (
  | { revision: 0; current: null }
  | { revision: number; current: TaskResultDeclaration }
);
export interface TaskResultPage {
  declarations: TaskResultDeclaration[];
  hasMore: boolean;
  nextBeforeRevision: number | null;
}
export interface TaskResultReceipt {
  action: 'recorded' | 'corrected' | 'unchanged';
  taskId: string;
  resultId: string;
  resultRevision: number;
}
function row(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid result object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown, max = Number.MAX_SAFE_INTEGER): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Array.from(value).length > max
  )
    throw new Error('Invalid result text');
  return value;
}
function integer(value: unknown, minimum = 1): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > 2147483647
  )
    throw new Error('Invalid result revision');
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid result mutability');
  return value;
}
function reference(value: unknown): TaskResultReference {
  const input = row(value);
  if (input.status !== 'official' && input.status !== 'superseded')
    throw new Error('Result requires a frozen Version');
  return {
    documentId: text(input.documentId),
    versionId: text(input.versionId),
    versionNumber: integer(input.versionNumber),
    title: text(input.title),
    status: input.status,
    representationId: text(input.representationId),
  };
}
export function readTaskResultDeclaration(
  value: unknown,
): TaskResultDeclaration {
  const input = row(value);
  const actor = row(input.actor);
  const occurredAt = text(input.occurredAt);
  if (
    !Number.isFinite(Date.parse(occurredAt)) ||
    new Date(occurredAt).toISOString() !== occurredAt
  )
    throw new Error('Invalid result time');
  const common = {
    id: text(input.id),
    revision: integer(input.revision),
    declaration: text(input.declaration, 2000),
    actor: {
      internalUserId: text(actor.internalUserId),
      workspaceMembershipId: text(actor.workspaceMembershipId),
      displayName: text(actor.displayName),
    },
    occurredAt,
    reference: reference(input.reference),
  };
  if (
    input.kind === 'recorded' &&
    common.revision === 1 &&
    input.predecessorId === undefined &&
    input.reason === undefined
  )
    return { ...common, kind: 'recorded' };
  if (input.kind === 'corrected' && common.revision > 1) {
    const predecessorId = text(input.predecessorId);
    if (predecessorId === common.id) throw new Error('Invalid predecessor');
    return {
      ...common,
      kind: 'corrected',
      predecessorId,
      reason: text(input.reason, 500),
    };
  }
  throw new Error('Invalid result declaration');
}
function target(input: Record<string, unknown>, taskId: string): void {
  if (input.taskId !== taskId) throw new Error('Mismatched result Task');
}
export function readTaskResultSnapshot(
  value: unknown,
  expected: { taskId: string; projectId: string },
): TaskResultSnapshot {
  const input = row(value);
  target(input, expected.taskId);
  if (input.projectId !== expected.projectId)
    throw new Error('Mismatched result Project');
  const common = {
    taskId: expected.taskId,
    projectId: expected.projectId,
    taskTitle: text(input.taskTitle),
    taskVersion: integer(input.taskVersion),
    mutable: boolean(input.mutable),
  };
  const revision = integer(input.revision, 0);
  if (revision === 0 && input.current === null)
    return { ...common, revision: 0, current: null };
  const current = readTaskResultDeclaration(input.current);
  if (revision !== current.revision) throw new Error('Missing current result');
  return { ...common, revision, current };
}
export function readTaskResultVersions(
  value: unknown,
  expected: { taskId: string },
): { mutable: boolean; versions: TaskResultReference[] } {
  const input = row(value);
  target(input, expected.taskId);
  if (!Array.isArray(input.versions))
    throw new Error('Invalid eligible Versions');
  const mutable = boolean(input.mutable);
  const versions = input.versions.map(reference);
  if (
    new Set(versions.map((item) => item.versionId)).size !== versions.length ||
    (!mutable && versions.length)
  )
    throw new Error('Invalid eligible Version set');
  return { mutable, versions };
}
export function readTaskResultPage(
  value: unknown,
  expected: { taskId: string; beforeRevision?: number },
): TaskResultPage {
  const input = row(value);
  target(input, expected.taskId);
  if (!Array.isArray(input.declarations) || input.declarations.length > 25)
    throw new Error('Invalid result history');
  const declarations = input.declarations.map(readTaskResultDeclaration);
  let previous = expected.beforeRevision ?? 2147483648;
  const ids = new Set<string>();
  for (const item of declarations) {
    if (item.revision >= previous || ids.has(item.id))
      throw new Error('Invalid result history order');
    previous = item.revision;
    ids.add(item.id);
  }
  const hasMore = boolean(input.hasMore);
  const nextBeforeRevision =
    input.nextBeforeRevision === null
      ? null
      : integer(input.nextBeforeRevision);
  if (
    hasMore
      ? declarations.length !== 25 ||
        nextBeforeRevision !== declarations.at(-1)?.revision
      : nextBeforeRevision !== null
  )
    throw new Error('Invalid result continuation');
  return { declarations, hasMore, nextBeforeRevision };
}
export function readTaskResultReceipt(
  value: unknown,
  expected: { taskId: string; revision: number; kind: 'record' | 'correct' },
): TaskResultReceipt {
  const input = row(value);
  target(input, expected.taskId);
  const action = input.action;
  const resultRevision = integer(input.resultRevision);
  if (
    expected.kind === 'record'
      ? action !== 'recorded' || resultRevision !== 1
      : !(
          (action === 'corrected' &&
            resultRevision === expected.revision + 1) ||
          (action === 'unchanged' && resultRevision === expected.revision)
        )
  )
    throw new Error('Invalid result receipt');
  if (action !== 'recorded' && action !== 'corrected' && action !== 'unchanged')
    throw new Error('Invalid result action');
  return {
    taskId: expected.taskId,
    action,
    resultRevision,
    resultId: text(input.resultId),
  };
}
