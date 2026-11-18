import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

// Reuse the repository's locked API toolchain, without installing test packages.
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
function validator(name) {
  return ajv.compile({
    $ref: `#/components/schemas/${name}`,
    components: contract.components,
  });
}

const id = '11111111-1111-4111-8111-111111111111';
const original = {
  kind: 'docx',
  fileName: 'dosar.docx',
  language: 'ru',
  size: 80,
  sha256: 'a'.repeat(64),
  title: 'Учебный оригинал',
  purpose: 'Анализ рабочего документа',
};
test('Project working originals have a closed draft-only native family contract', () => {
  const register = validator('RegisterWorkingDocumentInput');
  assert.equal(
    register({
      type: 'project-source',
      clientId: id,
      title: original.title,
      purpose: original.purpose,
    }),
    true,
    JSON.stringify(register.errors),
  );
  assert.equal(
    register({
      type: 'project-source',
      clientId: id,
      title: original.title,
      purpose: original.purpose,
      url: 'https://example.test/fake',
    }),
    false,
  );
  assert.equal(
    register({
      type: 'questionnaire',
      clientId: id,
      title: original.title,
      purpose: original.purpose,
    }),
    false,
  );
  const draft = validator('ProjectSourceDraftVersion');
  assert.equal(draft({ id, status: 'draft', representation: null }), true);
  assert.equal(draft({ id, status: 'official', representation: null }), false);
});
test('batch admission retains invalid items and refuses supplied ownership or unchecked languages', () => {
  const check = validator('DossierIntakeAdmission');
  const command = {
    format: 'DOCUMENT_INTAKE/1',
    expectedClientId: id,
    items: [
      original,
      {
        kind: 'invalid',
        fileName: 'excluded.txt',
        size: 8,
        reason: 'unsupported_type',
      },
    ],
  };
  assert.equal(check(command), true, JSON.stringify(check.errors));
  assert.equal(check({ ...command, companyId: id }), false);
  assert.equal(
    check({ ...command, items: [{ ...original, language: 'und' }] }),
    false,
  );
  assert.equal(
    check({ ...command, items: Array.from({ length: 26 }, () => original) }),
    false,
  );
});
test('public checkpoints preserve frozen receipt keys, exact source identities and uncertain attempts', () => {
  const check = validator('DossierIntakeBatch');
  const view = {
    format: 'DOCUMENT_INTAKE_VIEW/1',
    id,
    companyId: id,
    projectId: id,
    clientId: id,
    revision: 8,
    phase: 'active',
    createdAt: '2026-11-18T10:00:00Z',
    updatedAt: '2026-11-18T10:01:00Z',
    items: [
      {
        kind: 'file',
        id,
        file: original,
        keys: { register: id, link: id, upload: id, select: id },
        progress: {
          stage: 'source_stored',
          target: { documentId: id, versionId: id },
          sourceId: id,
          representationId: null,
        },
        attempts: 3,
        failureCount: 1,
        lastAttempt: { outcome: 'pending', id, at: '2026-11-18T10:01:00Z' },
      },
    ],
  };
  assert.equal(check(view), true, JSON.stringify(check.errors));
  assert.equal(check({ ...view, phase: 'background-running' }), false);
  assert.equal(
    check({
      ...view,
      items: [{ ...view.items[0], progress: { stage: 'complete' } }],
    }),
    false,
  );
});
test('every intake operation names native Project, Company, bounded commands and its public response', () => {
  const prefix = '/api/projects/{projectId}/dossier-analysis/intake-batches';
  const routes = Object.entries(contract.paths).filter(([path]) =>
    path.startsWith(prefix),
  );
  assert.equal(routes.length, 6);
  const operations = routes.flatMap(([, item]) => Object.values(item));
  assert.equal(operations.length, 7);
  for (const operation of operations) {
    assert.ok(
      operation.parameters.some(
        (parameter) =>
          parameter.$ref === '#/components/parameters/RequiredCompanyContextId',
      ),
    );
    assert.ok(
      operation.parameters.some(
        (parameter) => parameter.$ref === '#/components/parameters/ProjectId',
      ),
    );
    assert.ok(operation.responses[operation.requestBody ? '201' : '200']);
  }
});
