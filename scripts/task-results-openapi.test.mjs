import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

// Existing locked API toolchain; no additional test dependencies.
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
const paths = Object.entries(contract.paths).filter(
  ([path]) =>
    path.includes('/tasks/{taskId}/results') ||
    path.startsWith('/api/company-task-result-recorder-assignments'),
);
function resolveLocal(reference) {
  assert.ok(
    reference.startsWith('#/'),
    'Result contracts use local references.',
  );
  let current = contract;
  for (const segment of reference.slice(2).split('/')) {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    assert.ok(
      current && typeof current === 'object' && Object.hasOwn(current, key),
      `Unresolved public reference: ${reference}`,
    );
    current = current[key];
  }
  return current;
}
test('every new Task result public operation resolves its local contract references', () => {
  assert.equal(paths.length, 6);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if ('$ref' in value) resolveLocal(value.$ref);
    for (const child of Object.values(value)) visit(child);
  }
  for (const [, item] of paths) visit(item);
});
test('Task result refusal Response Objects preserve whole descriptions without stray YAML keys', () => {
  const allowed = new Set(['description', 'headers', 'content', 'links']);
  for (const [path, item] of paths) {
    for (const method of ['get', 'post', 'delete']) {
      const operation = item[method];
      if (!operation) continue;
      for (const [status, value] of Object.entries(operation.responses)) {
        const response = value.$ref ? resolveLocal(value.$ref) : value;
        assert.equal(
          typeof response.description,
          'string',
          `${method} ${path} ${status}`,
        );
        for (const key of Object.keys(response))
          assert.ok(
            allowed.has(key) || key.startsWith('x-'),
            `${method} ${path} ${status}: invalid Response Object key ${key}`,
          );
      }
    }
  }
});
test('both Recorder administration responses describe the actual captured-v1 assignment and refuse unknown captures', () => {
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  const uuid = '11111111-1111-4111-8111-111111111111';
  const assignment = {
    id: uuid,
    companyId: uuid,
    workspaceMembershipId: uuid,
    bundle: 'Company Task Result Recorder',
    permissionSetVersion: 'v1',
    active: true,
  };
  for (const [path, method, status] of [
    ['/api/company-task-result-recorder-assignments', 'post', '201'],
    [
      '/api/company-task-result-recorder-assignments/{workspaceMembershipId}/{companyId}',
      'delete',
      '200',
    ],
  ]) {
    const schema =
      contract.paths[path][method].responses[status].content['application/json']
        .schema;
    const validate = ajv.compile({
      ...schema,
      components: contract.components,
    });
    assert.equal(validate(assignment), true, JSON.stringify(validate.errors));
    assert.equal(
      validate({ ...assignment, permissionSetVersion: 'v2' }),
      false,
    );
    assert.equal(
      validate({ ...assignment, permissionSetVersion: null }),
      false,
    );
  }
});
