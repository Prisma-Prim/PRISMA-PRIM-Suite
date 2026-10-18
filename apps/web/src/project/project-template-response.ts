export interface TemplateTask {
  key: string;
  title: string;
  required: true;
}
export interface TemplateStage {
  key: string;
  title: string;
  tasks: TemplateTask[];
}
export interface TemplateVersion {
  templateKey: string;
  version: number;
  title: string;
  illustrative: true;
  stages: TemplateStage[];
}
export interface TemplateSelection {
  templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE';
  version: number;
}
export type SelectableTemplateVersion = TemplateVersion & TemplateSelection;
export interface CopiedTemplatePlan extends Omit<TemplateVersion, 'stages'> {
  stages: Array<
    Omit<TemplateStage, 'tasks'> & {
      tasks: Array<TemplateTask & { taskId: string }>;
    }
  >;
}

export function readTemplateCatalogue(
  value: unknown,
): SelectableTemplateVersion[] | undefined {
  if (
    !record(value) ||
    !Array.isArray(value.templates) ||
    value.templates.length > 20
  )
    return;
  const values: unknown[] = value.templates;
  const templates: SelectableTemplateVersion[] = [];
  const versions = new Set<string>();
  for (const entry of values) {
    const template = readTemplate(entry);
    if (
      !template ||
      template.templateKey !== 'CONSULTING_PREPARATION_ILLUSTRATIVE' ||
      !compatibleSource(template) ||
      versions.has(`${template.templateKey}:${template.version}`)
    )
      return;
    versions.add(`${template.templateKey}:${template.version}`);
    templates.push({
      ...template,
      templateKey: template.templateKey,
      version: template.version,
    });
  }
  return templates;
}
export interface TemplateCataloguePage {
  templates: SelectableTemplateVersion[];
  headVersion: number;
  nextBeforeVersion: number | null;
}
export function readTemplateCataloguePage(
  value: unknown,
): TemplateCataloguePage | undefined {
  const templates = readTemplateCatalogue(value);
  if (
    !templates ||
    !record(value) ||
    !positiveVersion(value.headVersion) ||
    !(
      value.nextBeforeVersion === null ||
      positiveVersion(value.nextBeforeVersion)
    )
  )
    return;
  const headVersion = value.headVersion;
  const nextBeforeVersion = value.nextBeforeVersion;
  if (
    templates.some((template) => template.version > headVersion) ||
    (nextBeforeVersion !== null &&
      templates.at(-1)?.version !== nextBeforeVersion)
  )
    return;
  return { templates, headVersion, nextBeforeVersion };
}
export function readTemplatePublication(value: unknown):
  | {
      versionId: string;
      templateKey: string;
      version: number;
      sourceVersion: number;
    }
  | undefined {
  if (
    !record(value) ||
    !uuid(value.versionId) ||
    value.templateKey !== 'CONSULTING_PREPARATION_ILLUSTRATIVE' ||
    !positiveVersion(value.version) ||
    !positiveVersion(value.sourceVersion) ||
    value.version !== value.sourceVersion + 1
  )
    return;
  return {
    versionId: value.versionId,
    templateKey: value.templateKey,
    version: value.version,
    sourceVersion: value.sourceVersion,
  };
}
function positiveVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 2147483647
  );
}
function compatibleSource(template: TemplateVersion) {
  return (
    positiveVersion(template.version) &&
    template.title === 'Préparation d’une mission de conseil' &&
    template.stages.map((stage) => `${stage.key}:${stage.title}`).join('|') ===
      'scoping:Cadrage|preparation:Préparation' &&
    template.stages
      .flatMap((stage) => stage.tasks.map((task) => task.key))
      .join('|') ===
      'clarify_request|confirm_scope|collect_questionnaire|prepare_plan'
  );
}
export function readCopiedTemplatePlan(
  value: unknown,
): { template: CopiedTemplatePlan | null } | undefined {
  if (!record(value)) return;
  if (value.template === null) return { template: null };
  const source = value.template;
  const template = readTemplate(source);
  if (!template || !record(source) || !Array.isArray(source.stages)) return;
  const stageValues: unknown[] = source.stages;
  const stages: CopiedTemplatePlan['stages'] = [];
  const taskIds = new Set<string>();
  for (const [stageIndex, stage] of template.stages.entries()) {
    const raw = stageValues[stageIndex];
    if (!record(raw) || !Array.isArray(raw.tasks)) return;
    const taskValues: unknown[] = raw.tasks;
    const tasks: Array<TemplateTask & { taskId: string }> = [];
    for (const [taskIndex, task] of stage.tasks.entries()) {
      const copy = taskValues[taskIndex];
      if (!record(copy) || !uuid(copy.taskId) || taskIds.has(copy.taskId))
        return;
      taskIds.add(copy.taskId);
      tasks.push({ ...task, taskId: copy.taskId });
    }
    stages.push({ ...stage, tasks });
  }
  return { template: { ...template, stages } };
}
function readTemplate(value: unknown): TemplateVersion | undefined {
  if (
    !record(value) ||
    !key(value.templateKey) ||
    typeof value.version !== 'number' ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    !title(value.title) ||
    value.illustrative !== true ||
    !Array.isArray(value.stages) ||
    value.stages.length !== 2
  )
    return;
  const stageValues: unknown[] = value.stages;
  const stages: TemplateStage[] = [];
  const stageKeys = new Set<string>();
  const taskKeys = new Set<string>();
  for (const stage of stageValues) {
    if (
      !record(stage) ||
      !key(stage.key) ||
      !title(stage.title) ||
      stageKeys.has(stage.key) ||
      !Array.isArray(stage.tasks) ||
      stage.tasks.length !== 2
    )
      return;
    stageKeys.add(stage.key);
    const taskValues: unknown[] = stage.tasks;
    const tasks: TemplateTask[] = [];
    for (const task of taskValues) {
      if (
        !record(task) ||
        !key(task.key) ||
        !title(task.title) ||
        task.required !== true ||
        taskKeys.has(task.key)
      )
        return;
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
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function title(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value === value.trim()
  );
}
function key(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value)
  );
}
function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  );
}
