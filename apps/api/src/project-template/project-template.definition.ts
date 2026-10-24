import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { readProjectTitle } from '../project/project.service.js';
import {
  PILOT_TEMPLATE_KEY,
  CONSULTING_MISSION_PILOT_V1,
} from './project-pilot-plan.definition.js';

export const LEGACY_TEMPLATE_KEY = 'CONSULTING_PREPARATION_ILLUSTRATIVE';
export type ProjectTemplateKey =
  typeof LEGACY_TEMPLATE_KEY | typeof PILOT_TEMPLATE_KEY;

export interface ProjectTemplateTaskDefinition {
  readonly key: string;
  readonly title: string;
  readonly required: true;
}
export interface ProjectTemplateStageDefinition {
  readonly key: string;
  readonly title: string;
  readonly tasks: readonly ProjectTemplateTaskDefinition[];
}
export interface LegacyProjectTemplateVersion {
  readonly templateKey: typeof LEGACY_TEMPLATE_KEY;
  readonly version: number;
  readonly title: string;
  readonly illustrative: true;
  readonly stages: readonly ProjectTemplateStageDefinition[];
}
export interface ProjectPilotActivity {
  readonly key: string;
  readonly title: string;
  readonly activity: string;
  readonly intendedResult: string;
}
export interface ProjectPilotPlanVersion {
  readonly templateKey: typeof PILOT_TEMPLATE_KEY;
  readonly version: 1;
  readonly title: string;
  readonly illustrative: true;
  readonly activities: readonly ProjectPilotActivity[];
}
export type ProjectTemplateVersion =
  LegacyProjectTemplateVersion | ProjectPilotPlanVersion;
export function isProjectTemplateKey(
  value: unknown,
): value is ProjectTemplateKey {
  return value === LEGACY_TEMPLATE_KEY || value === PILOT_TEMPLATE_KEY;
}
export function templateTasks(source: ProjectTemplateVersion) {
  return source.templateKey === PILOT_TEMPLATE_KEY
    ? source.activities
    : source.stages.flatMap((stage) => stage.tasks);
}

/** Approved illustrative business content; interface locale never rewrites it. */
export const CONSULTING_PREPARATION_V1 = {
  templateKey: LEGACY_TEMPLATE_KEY,
  version: 1,
  title: 'Préparation d’une mission de conseil',
  illustrative: true,
  stages: [
    {
      key: 'scoping',
      title: 'Cadrage',
      tasks: [
        {
          key: 'clarify_request',
          title: 'Clarifier la demande',
          required: true,
        },
        {
          key: 'confirm_scope',
          title: 'Confirmer le périmètre',
          required: true,
        },
      ],
    },
    {
      key: 'preparation',
      title: 'Préparation',
      tasks: [
        {
          key: 'collect_questionnaire',
          title: 'Recueillir le questionnaire',
          required: true,
        },
        { key: 'prepare_plan', title: 'Préparer le plan', required: true },
      ],
    },
  ],
} as const satisfies ProjectTemplateVersion;

/** Compatibility concerns the preserved model structure, independently of editable Task titles. */
export function isCompatibleIllustrativeTemplate(
  source: ProjectTemplateVersion,
): source is LegacyProjectTemplateVersion {
  if (source.templateKey !== LEGACY_TEMPLATE_KEY) return false;
  const baseline = CONSULTING_PREPARATION_V1;
  return (
    source.templateKey === baseline.templateKey &&
    source.title === baseline.title &&
    source.version >= 1 &&
    source.version <= 2147483647 &&
    source.stages.length === baseline.stages.length &&
    baseline.stages.every((stage, position) => {
      const actual = source.stages[position];
      return (
        actual?.key === stage.key &&
        actual.title === stage.title &&
        actual.tasks.length === stage.tasks.length &&
        stage.tasks.every(
          (task, index) =>
            actual.tasks[index]?.key === task.key &&
            actual.tasks[index]?.required === true,
        )
      );
    })
  );
}

export function templateCreationInput(value: unknown) {
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'title',
          'clientAccountId',
          'templateKey',
          'templateVersion',
        ].includes(key),
    ) ||
    !isProjectTemplateKey(value.templateKey) ||
    typeof value.templateVersion !== 'number' ||
    !Number.isInteger(value.templateVersion) ||
    value.templateVersion < 1 ||
    value.templateVersion > 2147483647
  )
    throw new BadRequestException(
      'Select the identified illustrative Template Version.',
    );
  return {
    title: readProjectTitle(value.title),
    clientAccountId: requireUuid(value.clientAccountId),
    templateKey: value.templateKey,
    templateVersion: value.templateVersion,
  };
}

/** Validate persisted historical source data, independently of today's catalogue. */
export function readTemplateSnapshot(value: unknown): ProjectTemplateVersion {
  if (record(value) && value.templateKey === PILOT_TEMPLATE_KEY)
    return readPilotSnapshot(value);
  if (
    !record(value) ||
    !exactKeys(value, [
      'templateKey',
      'version',
      'title',
      'illustrative',
      'stages',
    ]) ||
    value.templateKey !== LEGACY_TEMPLATE_KEY ||
    !Number.isInteger(value.version) ||
    typeof value.version !== 'number' ||
    value.version < 1 ||
    !title(value.title) ||
    value.illustrative !== true ||
    !Array.isArray(value.stages) ||
    value.stages.length !== 2
  )
    throw new Error('Invalid stored Project Template snapshot.');
  const stages: ProjectTemplateStageDefinition[] = [];
  const stageKeys = new Set<string>();
  const taskKeys = new Set<string>();
  const stageValues: unknown[] = value.stages;
  for (const stage of stageValues) {
    if (
      !record(stage) ||
      !exactKeys(stage, ['key', 'title', 'tasks']) ||
      !key(stage.key) ||
      !title(stage.title) ||
      stageKeys.has(stage.key) ||
      !Array.isArray(stage.tasks) ||
      stage.tasks.length !== 2
    )
      throw new Error('Invalid stored Project Template stage.');
    stageKeys.add(stage.key);
    const tasks: ProjectTemplateTaskDefinition[] = [];
    const taskValues: unknown[] = stage.tasks;
    for (const task of taskValues) {
      if (
        !record(task) ||
        !exactKeys(task, ['key', 'title', 'required']) ||
        !key(task.key) ||
        !title(task.title) ||
        task.required !== true ||
        taskKeys.has(task.key)
      )
        throw new Error('Invalid stored Project Template Task.');
      taskKeys.add(task.key);
      tasks.push({ key: task.key, title: task.title, required: true });
    }
    stages.push({ key: stage.key, title: stage.title, tasks });
  }
  return {
    templateKey: value.templateKey,
    version: value.version,
    title: value.title,
    illustrative: true,
    stages,
  };
}
function readPilotSnapshot(
  value: Record<string, unknown>,
): ProjectPilotPlanVersion {
  if (
    !exactKeys(value, [
      'templateKey',
      'version',
      'title',
      'illustrative',
      'activities',
    ]) ||
    value.version !== 1 ||
    value.title !== CONSULTING_MISSION_PILOT_V1.title ||
    value.illustrative !== true ||
    !Array.isArray(value.activities) ||
    value.activities.length !== 13
  )
    throw new Error('Invalid stored pilot activity plan.');
  const activities: ProjectPilotActivity[] = [];
  const rows: unknown[] = value.activities;
  for (const [index, row] of rows.entries()) {
    if (
      !record(row) ||
      !exactKeys(row, ['key', 'title', 'activity', 'intendedResult']) ||
      row.key !== `CT_AN${String(index + 1).padStart(2, '0')}` ||
      !title(row.title) ||
      !paragraph(row.activity) ||
      !paragraph(row.intendedResult)
    )
      throw new Error('Invalid stored pilot activity.');
    activities.push({
      key: row.key,
      title: row.title,
      activity: row.activity,
      intendedResult: row.intendedResult,
    });
  }
  return {
    templateKey: PILOT_TEMPLATE_KEY,
    version: 1,
    title: value.title,
    illustrative: true,
    activities,
  };
}
function paragraph(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    Array.from(value).length >= 1 &&
    Array.from(value).length <= 2000
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    actual.every((key) => expected.includes(key))
  );
}
function key(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value)
  );
}
function title(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value === value.trim()
  );
}
