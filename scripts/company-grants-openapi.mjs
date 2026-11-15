import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { COMPANY_ROLE_BUNDLES } from '../apps/api/src/access/company-permissions.ts';

// Reuse the locked toolchain used by the existing OpenAPI contract tests.
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
const { load, dump } = configRequire('js-yaml');
const { default: Ajv } = coreRequire('ajv/dist/2020.js');
const addFormats = coreRequire('ajv-formats');
const contractPath = new URL('../apps/api/openapi.yaml', import.meta.url);

export function readContract() {
  return load(readFileSync(contractPath, 'utf8'));
}

export function companyGrantSchema(registry = COMPANY_ROLE_BUNDLES) {
  return {
    description:
      'Generated from COMPANY_ROLE_BUNDLES; update with node scripts/company-grants-openapi.mjs --write.',
    type: 'object',
    additionalProperties: false,
    required: ['bundle', 'assignmentId', 'permissionSetVersion', 'permissions'],
    properties: {
      bundle: { type: 'string' },
      assignmentId: { type: 'string', format: 'uuid' },
      permissionSetVersion: { type: ['string', 'null'] },
      permissions: {
        type: 'array',
        uniqueItems: true,
        items: { type: 'string' },
      },
    },
    oneOf: Object.entries(registry).flatMap(([bundle, row]) => {
      const versions = Object.entries(row.versions);
      return (versions.length ? versions : [[null, []]]).map(
        ([version, permissions]) => ({
          properties: {
            bundle: { const: bundle },
            permissionSetVersion: { const: version },
            permissions: {
              minItems: permissions.length,
              maxItems: permissions.length,
              items: permissions.length ? { enum: [...permissions] } : false,
            },
          },
        }),
      );
    }),
  };
}

export function companyContextSchema(current, registry = COMPANY_ROLE_BUNDLES) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'displayName', 'grants'],
    properties: {
      id: current.properties.id,
      displayName: current.properties.displayName,
      grants: {
        type: 'array',
        uniqueItems: true,
        items: { $ref: '#/components/schemas/CompanyGrant' },
        allOf: Object.keys(registry).map((bundle) => ({
          contains: {
            properties: { bundle: { const: bundle } },
            required: ['bundle'],
          },
          minContains: 0,
          maxContains: 1,
        })),
      },
      ...Object.fromEntries(
        Object.entries(current.properties).filter(([key]) =>
          key.endsWith('Capture'),
        ),
      ),
    },
  };
}

/** Validate the actual GET response schema, including its referenced components. */
export function createCurrentActorValidator(contract = readContract()) {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addFormat('int32', { type: 'number', validate: Number.isInteger });
  const schema =
    contract.paths['/api/access/current-actor'].get.responses['200'].content[
      'application/json'
    ].schema;
  const validate = ajv.compile({ ...schema, components: contract.components });
  return {
    accepts: (value) => validate(value),
    errors: () => ajv.errorsText(validate.errors),
  };
}

async function main() {
  const contract = readContract();
  const current = contract.components.schemas.ActiveCompanyContext;
  const context = companyContextSchema(current);
  const grant = companyGrantSchema();
  if (process.argv.slice(2).join(' ') === '--write') {
    const block = dump(
      { ActiveCompanyContext: context, CompanyGrant: grant },
      { lineWidth: 100, noRefs: true },
    );
    const source = readFileSync(contractPath, 'utf8');
    const start = source.indexOf('    ActiveCompanyContext:\n');
    const next = source.indexOf('    ClientUnionDossier:\n', start);
    assert.ok(
      start >= 0 && next > start,
      'Expected the owned Company schema boundaries',
    );
    writeFileSync(
      contractPath,
      await format(
        source.slice(0, start) +
          block
            .split('\n')
            .filter(Boolean)
            .map((line) => `    ${line}`)
            .join('\n') +
          '\n' +
          source.slice(next),
        {
          ...(await resolveConfig(fileURLToPath(contractPath))),
          filepath: fileURLToPath(contractPath),
        },
      ),
    );
    console.log('Updated Company context/grant schemas from the registry.');
  } else {
    assert.ok(
      process.argv.length === 2 || process.argv[2] === '--check',
      'Use --write or --check',
    );
    assert.deepEqual(current, context, 'Public Company context schema drift');
    assert.deepEqual(
      contract.components.schemas.CompanyGrant,
      grant,
      'Registry grant schema drift: run node scripts/company-grants-openapi.mjs --write',
    );
    console.log('Company context/grant schemas match the registry.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
