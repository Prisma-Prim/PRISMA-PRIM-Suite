import { taskStates, type TaskState } from './task-response';
export interface StageIntent {
  expectedStageKey: string;
  expectedStageRevision: number;
  targetStageKey: string;
}
export interface StageReceipt {
  projectId: string;
  transitionId: string;
  stageRevision: number;
  fromStageKey: string;
  toStageKey: string;
}
export interface StageTransition extends StageReceipt {
  fromStageTitle: string;
  toStageTitle: string;
  occurredAt: string;
  actor: { displayName: string };
  requiredTasks: { taskId: string; version: number }[];
}
export type StageGate =
  | 'required_tasks_incomplete'
  | 'advance_authority_required'
  | 'project_closed'
  | 'original_client_inactive'
  | 'last_supported_stage'
  | 'ready';
export interface StageProgress {
  currentStageKey: string;
  currentStageTitle: string;
  stageRevision: number;
  nextStage: { key: string; title: string } | null;
  requiredTasks: {
    taskId: string;
    key: string;
    title: string;
    status: TaskState;
    version: number;
  }[];
  gate: StageGate;
  canAdvance: boolean;
  transitions: StageTransition[];
}
export function readStageProgress(value: unknown): StageProgress | null {
  if (!record(value)) invalid();
  if (value.progress === null) return null;
  const p = value.progress;
  if (
    !record(p) ||
    typeof p.canAdvance !== 'boolean' ||
    !gate(p.gate) ||
    !Array.isArray(p.requiredTasks) ||
    p.requiredTasks.length !== 2 ||
    !Array.isArray(p.transitions) ||
    p.transitions.length > 1
  )
    invalid();
  const stageRevision = revision(p.stageRevision);
  const currentStageKey = key(p.currentStageKey);
  const next = p.nextStage;
  if (
    stageRevision === 0
      ? currentStageKey !== 'scoping' ||
        !record(next) ||
        next.key !== 'preparation'
      : currentStageKey !== 'preparation' || next !== null
  )
    invalid();
  const nextStage = record(next)
    ? { key: key(next.key), title: text(next.title) }
    : null;
  const requiredTasks = p.requiredTasks.map((task: unknown) => {
    if (!record(task) || task.required !== true || !state(task.status))
      invalid();
    return {
      taskId: identifier(task.taskId),
      key: key(task.key),
      title: text(task.title),
      status: task.status,
      version: positive(task.version),
    };
  });
  if (new Set(requiredTasks.map((task) => task.taskId)).size !== 2) invalid();
  const transitions = p.transitions.map(readTransition);
  if (
    transitions.length !== stageRevision ||
    p.canAdvance !== (p.gate === 'ready') ||
    (p.gate === 'ready' &&
      (!nextStage || requiredTasks.some((task) => task.status !== 'done'))) ||
    (stageRevision === 1 && p.gate !== 'last_supported_stage')
  )
    invalid();
  return {
    currentStageKey,
    currentStageTitle: text(p.currentStageTitle),
    stageRevision,
    nextStage,
    requiredTasks,
    gate: p.gate,
    canAdvance: p.canAdvance,
    transitions,
  };
}
export function readStageReceipt(
  value: unknown,
  projectId: string,
): StageReceipt {
  if (
    !record(value) ||
    value.projectId !== projectId ||
    value.fromStageKey !== 'scoping' ||
    value.toStageKey !== 'preparation' ||
    value.stageRevision !== 1
  )
    invalid();
  return {
    projectId,
    transitionId: identifier(value.transitionId),
    fromStageKey: value.fromStageKey,
    toStageKey: value.toStageKey,
    stageRevision: value.stageRevision,
  };
}
export function readStageActivityMetadata(value: unknown) {
  if (
    !record(value) ||
    Object.keys(value).length !== 3 ||
    value.stageRevision !== 1 ||
    value.fromStageKey !== 'scoping' ||
    value.toStageKey !== 'preparation'
  )
    return undefined;
  return {
    stageRevision: value.stageRevision,
    fromStageKey: value.fromStageKey,
    toStageKey: value.toStageKey,
  };
}
function readTransition(value: unknown): StageTransition {
  if (
    !record(value) ||
    !record(value.actor) ||
    !Array.isArray(value.requiredTasks) ||
    value.requiredTasks.length !== 2 ||
    typeof value.occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(value.occurredAt))
  )
    invalid();
  const receipt = readStageReceipt(value, identifier(value.projectId));
  const requiredTasks = value.requiredTasks.map((task: unknown) => {
    if (!record(task)) invalid();
    return { taskId: identifier(task.taskId), version: positive(task.version) };
  });
  if (new Set(requiredTasks.map((task) => task.taskId)).size !== 2) invalid();
  return {
    ...receipt,
    fromStageTitle: text(value.fromStageTitle),
    toStageTitle: text(value.toStageTitle),
    actor: { displayName: text(value.actor.displayName) },
    occurredAt: value.occurredAt,
    requiredTasks,
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalid();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200)
    invalid();
  return value;
}
function key(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value))
    invalid();
  return value;
}
function revision(value: unknown): number {
  if (value !== 0 && value !== 1) invalid();
  return value;
}
function positive(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}
function state(value: unknown): value is TaskState {
  return taskStates.some((state) => state === value);
}
function gate(value: unknown): value is StageGate {
  return (
    value === 'required_tasks_incomplete' ||
    value === 'advance_authority_required' ||
    value === 'project_closed' ||
    value === 'original_client_inactive' ||
    value === 'last_supported_stage' ||
    value === 'ready'
  );
}
function invalid(): never {
  throw new Error('Invalid Project stage response.');
}
