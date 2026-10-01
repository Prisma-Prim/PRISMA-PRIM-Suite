import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

// Reuse the locked Nest CLI toolchain's declared dependencies. No package is
// installed and no private/versioned pnpm store path is assumed.
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

function validator(schema) {
  return ajv.compile({ ...schema, components: contract.components });
}
function response(path, method, status) {
  return validator(
    contract.paths[path][method].responses[status].content['application/json']
      .schema,
  );
}
const validateActivity = response('/api/activity-log', 'get', '200');
const uuid = '11111111-1111-4111-8111-111111111111';
const occurredAt = '2026-10-01T12:00:00.000Z';
function event(action, metadata) {
  return {
    id: uuid,
    action,
    occurredAt,
    actor: { internalUserId: uuid, displayName: 'Registrar' },
    target: {
      type: 'document',
      documentId: uuid,
      documentTitle: 'Questionnaire',
      companyId: uuid,
    },
    metadata,
  };
}
function accepts(validate, value) {
  assert.equal(validate(value), true, ajv.errorsText(validate.errors));
}

test('Activity response accepts draft additions, official appends and draft removals for every reference form', () => {
  for (const form of ['editable', 'rendered', 'signed', 'other']) {
    for (const appendedAfterDesignation of [false, true]) {
      accepts(validateActivity, {
        events: [
          event('document.representation.added', {
            versionNumber: 1,
            form,
            appendedAfterDesignation,
          }),
        ],
      });
    }
    accepts(validateActivity, {
      events: [
        event('document.representation.removed', {
          versionNumber: 1,
          form,
          appendedAfterDesignation: false,
        }),
      ],
    });
  }
});

test('Activity rejects absent or invalid designation timing, malformed forms and private metadata', () => {
  for (const action of [
    'document.representation.added',
    'document.representation.removed',
  ]) {
    const metadata = {
      versionNumber: 1,
      form: 'rendered',
      appendedAfterDesignation: false,
    };
    for (const field of Object.keys(metadata)) {
      const incomplete = { ...metadata };
      delete incomplete[field];
      assert.equal(
        validateActivity({ events: [event(action, incomplete)] }),
        false,
        `${action} requires ${field}`,
      );
    }
    for (const invalid of [
      { form: 'unknown' },
      { versionNumber: 0 },
      { appendedAfterDesignation: 'false' },
      ...['url', 'title', 'purpose', 'projectId', 'reason'].map((key) => ({
        [key]: 'private',
      })),
    ]) {
      assert.equal(
        validateActivity({
          events: [event(action, { ...metadata, ...invalid })],
        }),
        false,
      );
    }
  }
  assert.equal(
    validateActivity({
      events: [
        event('document.representation.removed', {
          versionNumber: 1,
          form: 'signed',
          appendedAfterDesignation: true,
        }),
      ],
    }),
    false,
  );
});

const versionsPath = '/api/documents/{documentId}/versions';
const addPath = `${versionsPath}/{versionId}/representations`;
const removePath = `${addPath}/{representationId}/removal`;

test('Document reference command responses accept the complete added and removed receipts', () => {
  const receipt = {
    documentId: uuid,
    workingRevision: 2,
    versionId: uuid,
    versionNumber: 1,
    representationId: uuid,
  };
  const validateAdded = response(addPath, 'post', '201');
  const validateRemoved = response(removePath, 'post', '200');
  for (const appendedAfterDesignation of [false, true]) {
    accepts(validateAdded, {
      ...receipt,
      action: 'representation_added',
      appendedAfterDesignation,
    });
  }
  accepts(validateRemoved, { ...receipt, action: 'representation_removed' });
  assert.equal(
    validateAdded({ ...receipt, action: 'representation_added' }),
    false,
  );
  assert.equal(
    validateRemoved({
      ...receipt,
      action: 'representation_added',
      appendedAfterDesignation: false,
    }),
    false,
  );
  accepts(response(addPath, 'post', '409'), {
    code: 'document_representation_capacity_exceeded',
    message: 'Capacity reached.',
  });
});

test('Version reads accept complete typed references and never accept a URL on denied access', () => {
  const validate = response(versionsPath, 'get', '200');
  const reference = {
    id: uuid,
    kind: 'external-reference',
    verification: 'unverified',
    position: 1,
    form: 'other',
    primary: true,
    appendedAfterDesignation: false,
    addedAt: occurredAt,
    addedBy: { displayName: 'Registrar' },
  };
  function page(representation) {
    return {
      workingRevision: 2,
      mutable: true,
      versions: [
        {
          id: uuid,
          number: 1,
          status: 'draft',
          createdAt: occurredAt,
          createdBy: { displayName: 'Registrar' },
          representations: [representation],
        },
      ],
    };
  }
  accepts(
    validate,
    page({
      ...reference,
      access: 'granted',
      url: 'https://example.test/reference',
    }),
  );
  accepts(validate, page({ ...reference, access: 'denied' }));
  assert.equal(
    validate(
      page({
        ...reference,
        access: 'denied',
        url: 'https://example.test/private',
      }),
    ),
    false,
  );
  for (const field of [
    'position',
    'form',
    'primary',
    'appendedAfterDesignation',
    'addedAt',
    'addedBy',
  ]) {
    const incomplete = { ...reference, access: 'denied' };
    delete incomplete[field];
    assert.equal(
      validate(page(incomplete)),
      false,
      `reference requires ${field}`,
    );
  }
});

test('Both reference routes expose valid error response descriptions', () => {
  for (const path of [addPath, removePath]) {
    for (const status of ['400', '401', '403', '404']) {
      const error = contract.paths[path].post.responses[status];
      assert.deepEqual(Object.keys(error), ['description']);
      assert.equal(typeof error.description, 'string');
    }
  }
});
