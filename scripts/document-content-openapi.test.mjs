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
const uuid = '11111111-1111-4111-8111-111111111111';
const instant = '2026-10-16T12:00:00.000Z';
const pdf = {
  representationId: uuid,
  revision: 2,
  fileName: 'questionnaire.pdf',
  mediaType: 'application/pdf',
  size: 595,
  sha256: 'a'.repeat(64),
  storedAt: instant,
  storedBy: { displayName: 'DEMO Member' },
  scan: { outcome: 'clean', engine: 'ClamAV 1.4.3', scannedAt: instant },
};

test('PDF metadata exposes details only in the explicitly granted state and rejects unproved scan provenance', () => {
  const validate = validator('DocumentPdfContent');
  for (const value of [
    { state: 'absent' },
    { state: 'stored', access: 'denied' },
    { ...pdf, state: 'stored', access: 'granted' },
  ])
    assert.equal(validate(value), true, ajv.errorsText(validate.errors));
  for (const value of [
    { ...pdf, state: 'stored', access: 'denied' },
    {
      ...pdf,
      state: 'stored',
      access: 'granted',
      scan: { ...pdf.scan, outcome: 'unknown' },
    },
    { ...pdf, state: 'stored', access: 'granted', size: 5242881 },
    { state: 'stored', access: 'granted' },
  ])
    assert.equal(validate(value), false);
});
test('PDF history carries immutable identity, revision and explicit bounded continuation', () => {
  const validate = validator('DocumentPdfUploadHistory');
  assert.equal(
    validate({
      uploads: [{ ...pdf, current: true }],
      nextBeforeRevision: null,
    }),
    true,
    ajv.errorsText(validate.errors),
  );
  assert.equal(
    validate({
      uploads: Array.from({ length: 21 }, () => ({ ...pdf, current: false })),
      nextBeforeRevision: 2,
    }),
    false,
  );
  assert.equal(
    validate({
      uploads: [{ ...pdf, current: true, bytes: 'private' }],
      nextBeforeRevision: null,
    }),
    false,
  );
});
test('content grants remain captured v1 bundles and public binary operations are registered', () => {
  for (const role of ['Reader', 'Uploader']) {
    const validate = validator(`CompanyDocumentContent${role}Assignment`);
    const assignment = {
      id: uuid,
      workspaceMembershipId: uuid,
      companyId: uuid,
      bundle: `Company Document Content ${role}`,
      permissionSetVersion: 'v1',
      active: true,
    };
    assert.equal(validate(assignment), true, ajv.errorsText(validate.errors));
    assert.equal(
      validate({ ...assignment, permissionSetVersion: 'v2' }),
      false,
    );
    assert.ok(
      contract.paths[
        `/api/company-document-content-${role.toLowerCase()}-assignments`
      ].post,
    );
  }
  const path = '/api/documents/{documentId}/versions/{versionId}/content';
  assert.ok(contract.paths[path].post.requestBody.content['application/pdf']);
  assert.ok(
    contract.paths[path].get.responses['200'].content['application/pdf'],
  );
  assert.ok(
    contract.paths[`${path}/history`].get.responses['200'].content[
      'application/json'
    ],
  );
  assert.ok(
    contract.paths[`${path}/{representationId}`].get.responses['200'].content[
      'application/pdf'
    ],
  );
});

test('PDF upload Response Objects preserve complete public refusal descriptions without extraneous YAML keys', () => {
  const path = '/api/documents/{documentId}/versions/{versionId}/content';
  const responses = contract.paths[path].post.responses;
  // Inspect every new content/grant operation, not only component schemas.
  const allowedResponseKeys = new Set([
    'description',
    'headers',
    'content',
    'links',
    '$ref',
  ]);
  for (const [publicPath, item] of Object.entries(contract.paths)) {
    if (
      !publicPath.startsWith('/api/company-document-content-') &&
      !publicPath.startsWith(path)
    )
      continue;
    for (const method of ['get', 'post', 'delete']) {
      const operation = item[method];
      if (!operation) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        assert.ok(
          response && typeof response === 'object' && !Array.isArray(response),
          `${publicPath} ${method} ${status}: Response Object required`,
        );
        if ('$ref' in response) assert.equal(typeof response.$ref, 'string');
        else
          assert.equal(
            typeof response.description,
            'string',
            `${publicPath} ${method} ${status}`,
          );
        for (const key of Object.keys(response))
          assert.ok(
            allowedResponseKeys.has(key),
            `${publicPath} ${method} ${status}: unexpected Response key ${key}`,
          );
      }
    }
  }
  const descriptions = {
    400: 'Invalid PDF, unsafe filename, idempotent command or failed malware scan.',
    409: 'Stale revision, conflicting replay or non-draft Version.',
    503: 'Scanner is unconfigured, unavailable or did not prove clean content.',
  };
  for (const [status, description] of Object.entries(descriptions)) {
    assert.equal(responses[status].description, description);
    assert.deepEqual(Object.keys(responses[status]), ['description']);
  }
});

test('the actor contract admits explicit captured-v1 Document content grants and refuses unknown rights or versions', () => {
  const validate = validator('ActorContext');
  const activeCompany = {
    id: uuid,
    displayName: 'Company DEMO',
    clientPermissions: [],
    documentPermissions: ['document.content.read', 'document.content.upload'],
    documentContentReaderAssignmentId: uuid,
    documentContentReaderPermissionSetVersion: 'v1',
    documentContentUploaderAssignmentId: uuid,
    documentContentUploaderPermissionSetVersion: 'v1',
  };
  const actor = {
    internalUserId: uuid,
    workspaceMembershipId: uuid,
    workspaceId: uuid,
    workspaceName: 'Workspace DEMO',
    displayName: 'Content Reader DEMO',
    email: 'reader@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany,
  };
  assert.equal(validate(actor), true, ajv.errorsText(validate.errors));
  for (const key of [
    'documentContentReaderPermissionSetVersion',
    'documentContentUploaderPermissionSetVersion',
  ]) {
    assert.equal(
      validate({ ...actor, activeCompany: { ...activeCompany, [key]: 'v2' } }),
      false,
    );
  }
  assert.equal(
    validate({
      ...actor,
      activeCompany: {
        ...activeCompany,
        documentPermissions: ['document.content.delete'],
      },
    }),
    false,
  );
});
