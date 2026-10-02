import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

// Reuse the installed, locked API toolchain; add no dependency or install.
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
const validate = ajv.compile({
  ...contract.paths['/api/activity-log'].get.responses['200'].content[
    'application/json'
  ].schema,
  components: contract.components,
});
const id = '11111111-1111-4111-8111-111111111111';
function associationEvent() {
  return {
    id,
    action: 'client_request.client_associated',
    occurredAt: '2026-10-02T18:00:00.000Z',
    actor: { internalUserId: id, displayName: 'Synthetic Intake Member' },
    target: { type: 'client_request', clientRequestId: id, companyId: id },
    // The persisted requestVersion: 2 is validated by Accountability, then
    // omitted from its public commercial projection, as with creation events.
    metadata: {},
  };
}

test('Activity response accepts the permission-filtered Request association event', () => {
  assert.equal(
    validate({ events: [associationEvent()] }),
    true,
    ajv.errorsText(validate.errors),
  );
});

test('Association projection rejects private Client data and persisted version metadata', () => {
  for (const metadata of [
    { requestVersion: 2 },
    { clientAccountId: id },
    { displayName: 'Private Client' },
    { opportunityId: id },
  ]) {
    assert.equal(
      validate({ events: [{ ...associationEvent(), metadata }] }),
      false,
    );
  }
  for (const extra of [
    { clientAccountId: id },
    { displayName: 'Private Client' },
    { opportunityId: id },
  ]) {
    assert.equal(
      validate({
        events: [
          {
            ...associationEvent(),
            target: { ...associationEvent().target, ...extra },
          },
        ],
      }),
      false,
    );
  }
});

test('Association projection rejects missing or malformed event and target fields', () => {
  for (const field of [
    'id',
    'action',
    'occurredAt',
    'actor',
    'target',
    'metadata',
  ]) {
    const incomplete = associationEvent();
    delete incomplete[field];
    assert.equal(validate({ events: [incomplete] }), false, field);
  }
  for (const field of ['type', 'clientRequestId', 'companyId']) {
    const incomplete = associationEvent();
    delete incomplete.target[field];
    assert.equal(validate({ events: [incomplete] }), false, field);
  }
  for (const target of [
    { type: 'client_request', clientRequestId: 'invalid', companyId: id },
    { type: 'client_request', clientRequestId: id, companyId: 'invalid' },
    { type: 'client_account', clientRequestId: id, companyId: id },
  ]) {
    assert.equal(
      validate({ events: [{ ...associationEvent(), target }] }),
      false,
    );
  }
});
