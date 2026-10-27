import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
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
const { load } = configRequire('js-yaml'),
  { default: Ajv } = coreRequire('ajv/dist/2020.js');
const addFormats = coreRequire('ajv-formats');
const contract = load(
  readFileSync(new URL('../apps/api/openapi.yaml', import.meta.url), 'utf8'),
);
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const uuid = '11111111-1111-4111-8111-111111111111';
const paths = [
  '/api/contracts/opportunities/{opportunityId}/projects/create-from-mission-plan',
  '/api/contracts/opportunities/{opportunityId}/agreements/{contractId}/projects/create-from-mission-plan',
];
const body = {
  title: 'Synthetic configured mission',
  expectedContractRevision: 3,
  acknowledgedCandidateProjectIds: [],
  missionPlan: { planId: uuid, versionId: uuid, versionNumber: 1 },
};
function validate(schema) {
  return ajv.compile({ ...schema, components: contract.components });
}
test('both configured Contract creation routes publish the strict exact-source command without a Client override', () => {
  for (const path of paths) {
    const operation = contract.paths[path]?.post;
    assert.ok(operation, 'Missing ' + path);
    const input = validate(
      operation.requestBody.content['application/json'].schema,
    );
    assert.equal(input(body), true, ajv.errorsText(input.errors));
    for (const changed of [
      { clientAccountId: uuid },
      { missionPlan: { ...body.missionPlan, latest: true } },
      { missionPlan: { ...body.missionPlan, versionNumber: 0 } },
      { missionPlan: { ...body.missionPlan, versionId: 'hidden' } },
      { acknowledgedCandidateProjectIds: [uuid, uuid] },
      { expectedContractRevision: 0 },
      { taskStatus: 'done' },
    ])
      assert.equal(
        input({ ...body, ...changed }),
        false,
        JSON.stringify(changed),
      );
    assert.equal(
      operation.responses['201'].content['application/json'].schema.$ref,
      '#/components/schemas/ContractMissionPlanCreationReceipt',
    );
    assert.ok(
      operation.parameters.some(
        (p) => p.$ref === '#/components/parameters/IdempotencyKey',
      ),
    );
    assert.ok(
      operation.parameters.some(
        (p) => p.$ref === '#/components/parameters/RequiredCompanyContextId',
      ),
    );
  }
});
test('the configured Contract receipt preserves complete native creation and link attribution', () => {
  const receipt = validate(
    contract.components.schemas.ContractMissionPlanCreationReceipt,
  );
  const value = {
    project: {
      id: uuid,
      companyId: uuid,
      clientAccountId: uuid,
      title: 'Synthetic mission',
      status: 'preparatory',
      createdAt: '2026-10-27T12:00:00.000Z',
    },
    link: {
      id: uuid,
      contractId: uuid,
      projectId: uuid,
      revision: 4,
      created: true,
      actorWorkspaceMembershipId: uuid,
      linkedAt: '2026-10-27T12:00:00.000Z',
    },
  };
  assert.equal(receipt(value), true, ajv.errorsText(receipt.errors));
  for (const changed of [
    { ...value, project: { ...value.project, status: 'active' } },
    { ...value, link: { ...value.link, created: false } },
    { ...value, link: { ...value.link, actorWorkspaceMembershipId: 'hidden' } },
  ])
    assert.equal(receipt(changed), false);
});
