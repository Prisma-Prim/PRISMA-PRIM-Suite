import { BadRequestException } from '@nestjs/common';

export interface ProjectStageTaskProof {
  taskId: string;
  version: number;
}
export interface ProjectStageReceipt {
  projectId: string;
  transitionId: string;
  stageRevision: number;
  fromStageKey: string;
  toStageKey: string;
}
export interface ProjectStageChangedActivityEvent {
  id: string;
  action: 'project.stage.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project';
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
  metadata: { stageRevision: number; fromStageKey: string; toStageKey: string };
}
export function stageCommand(value: unknown) {
  if (
    !record(value) ||
    Object.keys(value).length !== 3 ||
    !Object.keys(value).every((key) =>
      ['expectedStageKey', 'expectedStageRevision', 'targetStageKey'].includes(
        key,
      ),
    ) ||
    typeof value.expectedStageKey !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value.expectedStageKey) ||
    typeof value.targetStageKey !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value.targetStageKey) ||
    typeof value.expectedStageRevision !== 'number' ||
    !Number.isInteger(value.expectedStageRevision) ||
    value.expectedStageRevision < 0 ||
    value.expectedStageRevision > 2147483647
  )
    throw new BadRequestException(
      'Select an observed Project stage and revision and an explicit target.',
    );
  return {
    expectedStageKey: value.expectedStageKey,
    expectedStageRevision: value.expectedStageRevision,
    targetStageKey: value.targetStageKey,
  };
}
export function readStageTaskProof(value: unknown): ProjectStageTaskProof[] {
  if (!Array.isArray(value) || value.length !== 2)
    throw new Error('Invalid stored stage Task proof.');
  const values: unknown[] = value;
  const proof = values.map((task) => {
    if (
      !record(task) ||
      Object.keys(task).length !== 2 ||
      typeof task.taskId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        task.taskId,
      ) ||
      typeof task.version !== 'number' ||
      !Number.isInteger(task.version) ||
      task.version < 1
    )
      throw new Error('Invalid stored stage Task proof.');
    return { taskId: task.taskId, version: task.version };
  });
  if (new Set(proof.map((task) => task.taskId)).size !== 2)
    throw new Error('Duplicate stored stage Task proof.');
  return proof;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
