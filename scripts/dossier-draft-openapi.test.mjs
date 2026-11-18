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
const id = '14670000-0000-4000-8000-000000000001';
const example = {
  format: 'CERTIFICATION_STAGE_DRAFT/1',
  target: { caseId: id, projectId: id, revision: 9, step: 'stage_1_plan' },
  run: { id, snapshotHash: 'a'.repeat(64) },
  candidates: [
    {
      field: 'scope',
      value: 'Producție de lactate',
      proposalValue: 'Producție de lactate',
      suggestionId: id,
      reviewRevision: 1,
      reviewer: 'Fictional reviewer',
      reviewedAt: '2026-11-18T13:00:00Z',
      citations: [
        {
          sourceId: id,
          documentVersionId: id,
          locator: 'word/document.xml:p:3',
          start: 0,
          end: 20,
          quote: 'Producție de lactate',
          passageSha256: 'b'.repeat(64),
          documentTitle: 'Fictional source',
          fileName: 'domeniu.docx',
          versionNumber: 1,
        },
      ],
    },
  ],
};
test('documents both read-only native draft preparation operations with current target revision and native eligibility failures', () => {
  for (const suffix of ['certification-draft', 'certification-stage-draft']) {
    const operation =
      contract.paths[
        `/api/projects/{projectId}/dossier-analysis/runs/{runId}/${suffix}`
      ].get;
    assert.ok(
      operation.parameters.some(
        (p) => p.name === 'expectedRevision' && p.required,
      ),
    );
    assert.ok(
      operation.parameters.some((p) => p.name === 'caseId' && p.required),
    );
    for (const status of ['200', '400', '401', '403', '404', '409'])
      assert.ok(operation.responses[status]);
  }
});
test('the versioned stage contract keeps exact review/citation metadata and refuses professional acts or an unbound step', () => {
  const validate = validator('DossierCertificationStageDraft');
  assert.equal(validate(example), true, JSON.stringify(validate.errors));
  const missing = structuredClone(example);
  delete missing.target.step;
  assert.equal(validate(missing), false);
  const authority = structuredClone(example);
  authority.target.approved = true;
  assert.equal(validate(authority), false);
  const conclusion = structuredClone(example);
  conclusion.candidates[0].field = 'conclusion';
  assert.equal(validate(conclusion), false);
});
