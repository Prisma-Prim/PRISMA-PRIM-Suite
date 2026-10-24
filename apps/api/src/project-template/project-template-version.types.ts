import { BadRequestException } from '@nestjs/common';
import { createInput } from '../task/task.validation.js';
import {
  CONSULTING_PREPARATION_V1,
  isProjectTemplateKey,
} from './project-template.definition.js';

export interface ProjectTemplateVersionCreatedActivityEvent {
  id: string;
  action: 'project.template.version.created';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project_template_version';
    versionId: string;
    companyId: string;
  };
  metadata: { templateKey: string; version: number; sourceVersion: number };
}

export function requireTemplateKey(value: string) {
  if (!isProjectTemplateKey(value))
    throw new BadRequestException('Select the illustrative Template.');
  return value;
}

export function requireTemplateVersion(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    throw new BadRequestException(
      'Select an exact supported Template Version.',
    );
  return value;
}

export function publicationInput(value: unknown) {
  const row = record(value);
  exactKeys(row, ['sourceVersion', 'expectedHeadVersion', 'taskTitles']);
  const sourceVersion = requireTemplateVersion(row.sourceVersion);
  const expectedHeadVersion = requireTemplateVersion(row.expectedHeadVersion);
  if (
    sourceVersion !== expectedHeadVersion ||
    expectedHeadVersion === 2147483647
  )
    throw new BadRequestException('The source must be the observed head.');
  const submitted = record(row.taskTitles);
  const keys = CONSULTING_PREPARATION_V1.stages.flatMap((stage) =>
    stage.tasks.map((task) => task.key),
  );
  exactKeys(submitted, keys);
  // Task owns the normalized title grammar; no Client or Task instance is involved.
  const taskTitles = Object.fromEntries(
    keys.map((key) => [key, createInput({ title: submitted[key] }).title]),
  );
  return { sourceVersion, expectedHeadVersion, taskTitles };
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid Template publication.');
  return Object.fromEntries(Object.entries(value));
}
function exactKeys(row: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((key) => !keys.includes(key))
  )
    throw new BadRequestException(
      'Only the four required Task titles may change.',
    );
}
