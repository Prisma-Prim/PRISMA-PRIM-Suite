import {
  readResponsibleCandidates,
  type ResponsibleMember,
} from './project-responsible-response';
import { validTaskDate } from './task-response';

/** Project/Task PRD section 23: every lifecycle status a Project can hold. */
export const PROJECT_STATUSES = [
  'preparatory',
  'active',
  'on_hold',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const START_DECLARATION_ITEMS = [
  'approvedOffer',
  'contractOrPrecontract',
  'projectPlan',
  'initialDocuments',
  'deadlines',
  'financialConditions',
  'risks',
] as const;
export type StartDeclarationItem = (typeof START_DECLARATION_ITEMS)[number];
export type StartDeclarationValue = 'present' | 'missing';
export type StartDeclaration = Record<
  StartDeclarationItem,
  StartDeclarationValue
>;

export type ProjectStart = {
  declaredAt: string;
  declaredBy: { displayName: string };
  declaration: StartDeclaration;
  exception: {
    reason: string;
    completionResponsible: ResponsibleMember;
    completionDueDate: string;
  } | null;
};

type TransitionBase = {
  lifecycleRevision: number;
  from: ProjectStatus;
  to: ProjectStatus;
  occurredAt: string;
  actor: { displayName: string };
};
export type ProjectLifecycleTransition =
  | (TransitionBase & { action: 'activate'; withStartException: boolean })
  | (TransitionBase & { action: 'hold'; reason: string })
  | (TransitionBase & { action: 'resume' })
  | (TransitionBase & { action: 'complete'; note: string })
  | (TransitionBase & { action: 'cancel'; reason: string });

export type ProjectLifecycle = {
  status: ProjectStatus;
  lifecycleRevision: number;
  mutable: boolean;
  start: ProjectStart | null;
  transitions: ProjectLifecycleTransition[];
};

export type LifecycleCommandAction =
  'activate' | 'hold' | 'resume' | 'complete' | 'cancel';
export type LifecycleReceipt = {
  projectId: string;
  action: LifecycleCommandAction;
  from: ProjectStatus;
  to: ProjectStatus;
  lifecycleRevision: number;
};

/** The section 23 transitions: the only from/to pair each action may record. */
const TRANSITIONS = {
  activate: { from: ['preparatory'], to: 'active' },
  hold: { from: ['active'], to: 'on_hold' },
  resume: { from: ['on_hold'], to: 'active' },
  complete: { from: ['active'], to: 'completed' },
  cancel: { from: ['preparatory', 'active', 'on_hold'], to: 'cancelled' },
} as const satisfies Record<
  ProjectLifecycleTransition['action'],
  { from: readonly ProjectStatus[]; to: ProjectStatus }
>;

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return PROJECT_STATUSES.some((status) => status === value);
}

export function isClosedProjectStatus(status: ProjectStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/** Exactly one of the five statuses; anything else fails closed. */
function readProjectStatus(value: unknown): ProjectStatus {
  if (!isProjectStatus(value)) invalid();
  return value;
}

/** Whether a from/to pair is exactly the transition an action records. */
function isLifecycleTransition(
  action: ProjectLifecycleTransition['action'],
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  const transition = TRANSITIONS[action];
  const sources: readonly ProjectStatus[] = transition.from;
  return sources.includes(from) && transition.to === to;
}

export function readProjectLifecycle(value: unknown): ProjectLifecycle {
  const row = record(value);
  if (typeof row.mutable !== 'boolean' || !Array.isArray(row.transitions))
    invalid();
  const status = readProjectStatus(row.status);
  const lifecycleRevision = revision(row.lifecycleRevision, 0);
  const start = row.start === null ? null : readStart(row.start);
  const transitions = row.transitions.map((entry: unknown) =>
    readTransition(entry),
  );
  // Revision 0 means no transition ever left `preparatory`.
  if (
    (lifecycleRevision === 0) !== (status === 'preparatory') ||
    (lifecycleRevision === 0 && (start !== null || transitions.length > 0))
  )
    invalid();
  return {
    status,
    lifecycleRevision,
    mutable: row.mutable,
    start,
    transitions,
  };
}

export function readStartExceptionCandidates(
  value: unknown,
): ResponsibleMember[] {
  return readResponsibleCandidates(value);
}

export function readLifecycleReceipt(
  value: unknown,
  projectId: string,
  action: LifecycleCommandAction,
): LifecycleReceipt {
  const row = record(value);
  if (row.projectId !== projectId || row.action !== action) invalid();
  const from = readProjectStatus(row.from);
  const to = readProjectStatus(row.to);
  if (!isLifecycleTransition(action, from, to)) invalid();
  return {
    projectId,
    action,
    from,
    to,
    lifecycleRevision: revision(row.lifecycleRevision, 1),
  };
}

function readStart(value: unknown): ProjectStart {
  const row = record(value);
  const declaredBy = record(row.declaredBy);
  const declarationRow = record(row.declaration);
  if (Object.keys(declarationRow).length !== START_DECLARATION_ITEMS.length)
    invalid();
  const declaration: StartDeclaration = {
    approvedOffer: declared(declarationRow.approvedOffer),
    contractOrPrecontract: declared(declarationRow.contractOrPrecontract),
    projectPlan: declared(declarationRow.projectPlan),
    initialDocuments: declared(declarationRow.initialDocuments),
    deadlines: declared(declarationRow.deadlines),
    financialConditions: declared(declarationRow.financialConditions),
    risks: declared(declarationRow.risks),
  };
  const anyMissing = START_DECLARATION_ITEMS.some(
    (item) => declaration[item] === 'missing',
  );
  const exception =
    row.exception === null ? null : readException(row.exception);
  // The exception is recorded if and only if an item is missing.
  if (anyMissing !== (exception !== null)) invalid();
  return {
    declaredAt: timestamp(row.declaredAt),
    declaredBy: { displayName: text(declaredBy.displayName) },
    declaration,
    exception,
  };
}

function readException(value: unknown): NonNullable<ProjectStart['exception']> {
  const row = record(value);
  const member = record(row.completionResponsible);
  return {
    reason: text(row.reason),
    completionResponsible: {
      workspaceMembershipId: text(member.workspaceMembershipId),
      displayLabel: text(member.displayLabel),
    },
    completionDueDate: calendarDate(row.completionDueDate),
  };
}

function readTransition(value: unknown): ProjectLifecycleTransition {
  const row = record(value);
  const actor = record(row.actor);
  const base = {
    lifecycleRevision: revision(row.lifecycleRevision, 1),
    from: readProjectStatus(row.from),
    to: readProjectStatus(row.to),
    occurredAt: timestamp(row.occurredAt),
    actor: { displayName: text(actor.displayName) },
  };
  const action = transitionAction(row.action);
  if (!isLifecycleTransition(action, base.from, base.to)) invalid();
  switch (action) {
    case 'activate':
      if (typeof row.withStartException !== 'boolean') invalid();
      return { ...base, action, withStartException: row.withStartException };
    case 'hold':
      return { ...base, action, reason: text(row.reason) };
    case 'cancel':
      return { ...base, action, reason: text(row.reason) };
    case 'resume':
      return { ...base, action };
    case 'complete':
      return { ...base, action, note: text(row.note) };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function transitionAction(
  value: unknown,
): ProjectLifecycleTransition['action'] {
  switch (value) {
    case 'activate':
    case 'hold':
    case 'resume':
    case 'complete':
    case 'cancel':
      return value;
    default:
      return invalid();
  }
}

function declared(value: unknown): StartDeclarationValue {
  if (value !== 'present' && value !== 'missing') invalid();
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalid();
  return value;
}

function revision(value: unknown, minimum: 0 | 1): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    invalid();
  return value;
}

function timestamp(value: unknown): string {
  const result = text(value);
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== result)
    invalid();
  return result;
}

/** An exact YYYY-MM-DD date under the section 18 rules Tasks use. */
function calendarDate(value: unknown): string {
  if (typeof value !== 'string' || !validTaskDate(value)) invalid();
  return value;
}

function invalid(): never {
  throw new Error('Invalid Project lifecycle response');
}

/**
 * The metadata of one `project.lifecycle.changed` Activity event: one variant
 * per section 23 transition, discriminated by its from/to pair.
 */
export type ProjectLifecycleActivityMetadata =
  | {
      lifecycleRevision: number;
      from: 'preparatory';
      to: 'active';
      withStartException: boolean;
    }
  | { lifecycleRevision: number; from: 'active'; to: 'on_hold' }
  | { lifecycleRevision: number; from: 'on_hold'; to: 'active' }
  | { lifecycleRevision: number; from: 'active'; to: 'completed' }
  | {
      lifecycleRevision: number;
      from: 'preparatory' | 'active' | 'on_hold';
      to: 'cancelled';
    };

/** Exactly one transition's metadata, or undefined so the event is omitted. */
export function readLifecycleActivityMetadata(
  value: unknown,
): ProjectLifecycleActivityMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  const { lifecycleRevision, from, to, withStartException } = row;
  if (
    typeof lifecycleRevision !== 'number' ||
    !Number.isSafeInteger(lifecycleRevision) ||
    lifecycleRevision < 1 ||
    !('from' in row) ||
    !('to' in row)
  )
    return undefined;
  const fields = Object.keys(row).length;
  if (from === 'preparatory' && to === 'active')
    return fields === 4 && typeof withStartException === 'boolean'
      ? { lifecycleRevision, from, to, withStartException }
      : undefined;
  if (fields !== 3) return undefined;
  if (from === 'active' && to === 'on_hold')
    return { lifecycleRevision, from, to };
  if (from === 'on_hold' && to === 'active')
    return { lifecycleRevision, from, to };
  if (from === 'active' && to === 'completed')
    return { lifecycleRevision, from, to };
  if (
    (from === 'preparatory' || from === 'active' || from === 'on_hold') &&
    to === 'cancelled'
  )
    return { lifecycleRevision, from, to };
  return undefined;
}
