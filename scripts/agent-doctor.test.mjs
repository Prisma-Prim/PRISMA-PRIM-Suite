import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareVersions,
  databaseTargetsAreSafe,
  evaluateEnvironment,
  maximumExclusiveVersion,
  minimumVersion,
  packageManagerVersion,
  parseDatabaseTarget,
  parseVersion,
} from './agent-doctor.mjs';

const healthyEnvironment = {
  nodeRange: '>=24.0.0 <25.0.0',
  nodeVersion: 'v24.14.0',
  packageManager: 'pnpm@11.20.0',
  pnpmVersion: '11.20.0',
  workspaceManifestExists: true,
  lockfileExists: true,
  dependenciesInstalled: true,
  chromiumAvailable: true,
  databaseUrl:
    'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_dev',
  testDatabaseUrl:
    'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_test',
  postgresAvailable: true,
};

test('parses and compares semantic runtime versions', () => {
  assert.deepEqual(parseVersion('v24.14.0'), [24, 14, 0]);
  assert.equal(compareVersions([24, 1, 0], [24, 0, 9]), 1);
  assert.deepEqual(minimumVersion('>=24.0.0 <25.0.0'), [24, 0, 0]);
  assert.deepEqual(maximumExclusiveVersion('>=24.0.0 <25.0.0'), [25, 0, 0]);
  assert.equal(packageManagerVersion('pnpm@11.20.0'), '11.20.0');
});

test('parses PostgreSQL targets without exposing credentials', () => {
  assert.deepEqual(
    parseDatabaseTarget(
      'postgresql://user:secret@127.0.0.1:5432/prisma_prim_test',
    ),
    {
      database: 'prisma_prim_test',
      hostname: '127.0.0.1',
      port: '5432',
    },
  );
  assert.equal(parseDatabaseTarget('https://example.test/database'), null);
  assert.equal(
    parseDatabaseTarget(
      'postgresql://user:secret@127.0.0.1:5432/prisma_prim_test?host=db.example.test',
    ),
    null,
  );
  assert.equal(parseDatabaseTarget('not-a-url'), null);
});

test('certifies only distinct loopback targets before connectivity is attempted', () => {
  assert.equal(
    databaseTargetsAreSafe(
      healthyEnvironment.databaseUrl,
      healthyEnvironment.testDatabaseUrl,
    ),
    true,
  );
  assert.equal(
    databaseTargetsAreSafe(
      healthyEnvironment.databaseUrl,
      'postgresql://user:secret@127.0.0.1:5432/prisma_prim_test?host=db.example.test',
    ),
    false,
  );
  assert.equal(
    databaseTargetsAreSafe(
      healthyEnvironment.databaseUrl,
      'postgresql://user:secret@db.example.test:5432/prisma_prim_test',
    ),
    false,
  );
});

test('accepts the complete canonical environment', () => {
  const results = evaluateEnvironment(healthyEnvironment);
  assert.equal(
    results.some((check) => check.status === 'FAIL'),
    false,
  );
  assert.equal(results.find((check) => check.id === 'chromium').status, 'SKIP');
  assert.equal(
    results.find((check) => check.id === 'database-variables').status,
    'SKIP',
  );
});

test('the web profile requires an executable Chromium', () => {
  const healthy = evaluateEnvironment(healthyEnvironment, 'web');
  const missing = evaluateEnvironment(
    { ...healthyEnvironment, chromiumAvailable: false },
    'web',
  );

  assert.equal(healthy.find((check) => check.id === 'chromium').status, 'PASS');
  assert.equal(missing.find((check) => check.id === 'chromium').status, 'FAIL');
});

test('the web-postgres profile requires safe local database targets and connectivity', () => {
  const healthy = evaluateEnvironment(healthyEnvironment, 'web-postgres');
  const failedIds = healthy
    .filter((check) => check.status === 'FAIL')
    .map((check) => check.id);

  assert.deepEqual(failedIds, []);
  assert.equal(
    healthy.find((check) => check.id === 'database-safety').status,
    'PASS',
  );
  assert.equal(healthy.find((check) => check.id === 'postgres').status, 'PASS');
});

test('rejects missing, remote, shared, and non-test database targets', () => {
  const missing = evaluateEnvironment(
    { ...healthyEnvironment, testDatabaseUrl: '' },
    'web-postgres',
  );
  const remote = evaluateEnvironment(
    {
      ...healthyEnvironment,
      testDatabaseUrl:
        'postgresql://prisma_prim:secret@db.example.test:5432/prisma_prim_test',
    },
    'web-postgres',
  );
  const shared = evaluateEnvironment(
    {
      ...healthyEnvironment,
      testDatabaseUrl: healthyEnvironment.databaseUrl,
    },
    'web-postgres',
  );
  const unsafeName = evaluateEnvironment(
    {
      ...healthyEnvironment,
      testDatabaseUrl:
        'postgresql://prisma_prim:secret@127.0.0.1:5432/prisma_prim',
    },
    'web-postgres',
  );

  assert.equal(
    missing.find((check) => check.id === 'database-variables').status,
    'FAIL',
  );
  for (const results of [remote, shared, unsafeName]) {
    assert.equal(
      results.find((check) => check.id === 'database-safety').status,
      'FAIL',
    );
  }
});

test('reports PostgreSQL connectivity independently from URL safety', () => {
  const results = evaluateEnvironment(
    { ...healthyEnvironment, postgresAvailable: false },
    'web-postgres',
  );

  assert.equal(
    results.find((check) => check.id === 'database-safety').status,
    'PASS',
  );
  assert.equal(results.find((check) => check.id === 'postgres').status, 'FAIL');
});

test('reports an outdated Node runtime with a durable remediation', () => {
  const results = evaluateEnvironment({
    ...healthyEnvironment,
    nodeVersion: 'v22.22.0',
  });
  const node = results.find((check) => check.id === 'node');

  assert.equal(node.status, 'FAIL');
  assert.match(node.remediation, /satisfying >=24\.0\.0 <25\.0\.0/);
});

test('rejects a future Node major that CI does not target', () => {
  const results = evaluateEnvironment({
    ...healthyEnvironment,
    nodeVersion: 'v25.0.0',
  });
  assert.equal(results.find((check) => check.id === 'node').status, 'FAIL');
});

test('reports pnpm and dependency setup drift independently in the base profile', () => {
  const results = evaluateEnvironment({
    ...healthyEnvironment,
    pnpmVersion: '11.16.0',
    dependenciesInstalled: false,
    chromiumAvailable: false,
  });
  const failedIds = results
    .filter((check) => check.status === 'FAIL')
    .map((check) => check.id);

  assert.deepEqual(failedIds, ['pnpm', 'dependencies']);
});
