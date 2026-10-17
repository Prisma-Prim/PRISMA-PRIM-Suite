import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

// Use the locked API toolchain; no extra dependency or private store path.
const apiRequire = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const cliRequire = createRequire(
  apiRequire.resolve('@nestjs/cli/package.json'),
);
const coreRequire = createRequire(cliRequire.resolve('@angular-devkit/core'));
const checkerRequire = createRequire(
  cliRequire.resolve('fork-ts-checker-webpack-plugin'),
);
const configRequire = createRequire(checkerRequire.resolve('cosmiconfig'));
const { load } = configRequire('js-yaml');
const { default: Ajv } = coreRequire('ajv/dist/2020.js');
const addFormats = coreRequire('ajv-formats');
const contract = load(
  readFileSync(new URL('../apps/api/openapi.yaml', import.meta.url), 'utf8'),
);
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addFormat('int32', { type: 'number', validate: Number.isInteger });
const uuid = '11111111-1111-4111-8111-111111111111';
const templateKey = 'CONSULTING_PREPARATION_ILLUSTRATIVE';
function validator(schema) {
  return ajv.compile({ ...schema, components: contract.components });
}
function response(path, method, status) {
  return validator(
    contract.paths[path][method].responses[status].content['application/json']
      .schema,
  );
}
function accepts(validate, value) {
  assert.equal(validate(value), true, ajv.errorsText(validate.errors));
}

const source = {
  templateKey,
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
};

test('Template creation OpenAPI admits only the identified v1 intent and complete Project receipt', () => {
  const operation = contract.paths['/api/projects/from-template'].post;
  const validate = validator(
    operation.requestBody.content['application/json'].schema,
  );
  const input = {
    title: 'Project {original}',
    clientAccountId: uuid,
    templateKey,
    templateVersion: 1,
  };
  accepts(validate, input);
  accepts(validate, { ...input, title: ' '.repeat(250) + 'Project' });
  for (const changed of [
    { templateVersion: 2 },
    { templateKey: 'UNAPPROVED' },
    { title: '' },
    { clientAccountId: 'hidden' },
    { assigneeMembershipId: uuid },
  ]) {
    assert.equal(validate({ ...input, ...changed }), false);
  }
  const created = response('/api/projects/from-template', 'post', '201');
  const project = {
    id: uuid,
    companyId: uuid,
    clientAccountId: uuid,
    clientDisplayName: 'Client',
    title: 'Project',
    status: 'preparatory',
    createdAt: '2026-10-16T12:00:00.000Z',
  };
  accepts(created, project);
  // Exact replay supplies current display facts, including a later closed state.
  accepts(created, { ...project, status: 'cancelled' });
  assert.equal(created({ ...project, status: 'started' }), false);
  assert.equal(created({ ...project, createdAt: 'not an instant' }), false);
});

test('Template source and copied-plan reads preserve two stages/four required Task identities', () => {
  const catalogue = response('/api/project-templates', 'get', '200');
  accepts(catalogue, { templates: [source] });
  assert.equal(
    catalogue({ templates: [{ ...source, illustrative: false }] }),
    false,
  );
  const plan = {
    ...source,
    stages: source.stages.map((stage, stageIndex) => ({
      ...stage,
      tasks: stage.tasks.map((task, taskIndex) => ({
        ...task,
        taskId: `00000000-0000-4000-8000-00000000000${stageIndex * 2 + taskIndex + 1}`,
      })),
    })),
  };
  const validate = response('/api/projects/{projectId}/template', 'get', '200');
  accepts(validate, { template: plan });
  accepts(validate, { template: null });
  assert.equal(
    validate({ template: source }),
    false,
    'A copied Task must retain its real identity.',
  );
  assert.equal(validate({ template: { ...plan, stages: [] } }), false);
  assert.equal(
    validate({
      template: {
        ...plan,
        stages: [{ ...plan.stages[0], tasks: [] }, plan.stages[1]],
      },
    }),
    false,
  );
});

test('Template User grants and actor projection reject unknown captured authority', () => {
  const path = '/api/company-project-template-user-assignments';
  const grant = response(path, 'post', '201');
  const revoke = response(
    `${path}/{workspaceMembershipId}/{companyId}`,
    'delete',
    '200',
  );
  const assignment = {
    id: uuid,
    workspaceMembershipId: uuid,
    companyId: uuid,
    bundle: 'Company Project Template User',
    permissionSetVersion: 'v1',
    active: true,
  };
  accepts(grant, assignment);
  accepts(revoke, { ...assignment, active: false });
  for (const permissionSetVersion of [null, 'v2', 'unknown'])
    assert.equal(grant({ ...assignment, permissionSetVersion }), false);
  const actor = validator(contract.components.schemas.ActiveCompanyContext);
  const company = {
    id: uuid,
    displayName: 'Company',
    clientPermissions: [],
    projectTemplatePermissions: [
      'project.template.read',
      'project.template.instantiate',
    ],
    projectTemplatePermissionAssignmentId: uuid,
    projectTemplatePermissionSetVersion: 'v1',
  };
  accepts(actor, company);
  assert.equal(
    actor({ ...company, projectTemplatePermissionSetVersion: 'v2' }),
    false,
  );
  assert.equal(
    actor({
      ...company,
      projectTemplatePermissions: ['project.stage.transition'],
    }),
    false,
  );
});
