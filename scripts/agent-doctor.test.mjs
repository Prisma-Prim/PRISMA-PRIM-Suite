import assert from 'node:assert/strict';
import test from 'node:test';

import * as agentDoctor from './agent-doctor.mjs';

const { evaluateEnvironment: evaluateEnvironmentReport } = agentDoctor;

const healthyEnvironment = {
  nodeRange: '>=24.0.0 <25.0.0',
  nodeVersion: 'v24.14.0',
  pinnedNodeVersion: '24',
  packageManager: 'pnpm@11.20.0',
  pnpmProbe: { state: 'available', version: '11.20.0' },
  workspaceManifestExists: true,
  lockfileExists: true,
  dependenciesInstalled: true,
  chromiumAvailable: true,
  databaseUrl:
    'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_dev',
  testDatabaseUrl:
    'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_test',
  postgresProbe: { state: 'available', serverVersionNumber: 170011 },
};

function evaluateEnvironment(snapshot, profile) {
  return evaluateEnvironmentReport(snapshot, profile).checks;
}

test('exposes only the stable evaluation and inspection operations', () => {
  assert.deepEqual(Object.keys(agentDoctor).sort(), [
    'evaluateEnvironment',
    'inspectEnvironment',
  ]);
});

test('publishes ordered checks and PostgreSQL capabilities in one report', () => {
  const report = evaluateEnvironmentReport(
    {
      ...healthyEnvironment,
      postgresProbe: {
        state: 'available',
        serverVersionNumber: 170011,
        canCreateDatabase: true,
      },
    },
    'web-postgres',
  );

  assert.deepEqual(
    report.checks.map(({ id }) => id),
    [
      'node',
      'pnpm',
      'workspace',
      'lockfile',
      'dependencies',
      'chromium',
      'database-variables',
      'database-safety',
      'postgres',
    ],
  );
  assert.deepEqual(report.capabilities.postgres, {
    state: 'available',
    serverVersionNumber: 170011,
    canCreateDatabase: true,
  });
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

test('the postgres profile verifies databases without requiring Chromium', () => {
  const results = evaluateEnvironment(
    { ...healthyEnvironment, chromiumAvailable: false },
    'postgres',
  );

  assert.equal(results.find((check) => check.id === 'chromium').status, 'SKIP');
  assert.equal(
    results.find((check) => check.id === 'database-safety').status,
    'PASS',
  );
  assert.equal(results.find((check) => check.id === 'postgres').status, 'PASS');
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

test('offers exact-head Early CI when hosted integration prerequisites are absent', () => {
  const results = evaluateEnvironment(
    {
      ...healthyEnvironment,
      chromiumAvailable: false,
      databaseUrl: '',
      testDatabaseUrl: '',
      postgresProbe: { state: 'not-run' },
    },
    'web-postgres',
  );

  for (const id of ['chromium', 'database-variables']) {
    assert.match(
      results.find((check) => check.id === id).remediation,
      /agent-doctor-early-ci: required.*automatic exact-head/u,
    );
  }
});

test('does not request a handoff when the selected profile is locally healthy', () => {
  const report = evaluateEnvironmentReport(healthyEnvironment, 'web-postgres');

  assert.deepEqual(report.handoff, {
    state: 'not-required',
    profile: 'web-postgres',
  });
});

test('publishes an automatic exact-head handoff for recoverable web-postgres blockers', () => {
  const report = evaluateEnvironmentReport(
    {
      ...healthyEnvironment,
      chromiumAvailable: false,
      databaseUrl: '',
      testDatabaseUrl: '',
      postgresProbe: { state: 'not-run' },
    },
    'web-postgres',
  );

  assert.deepEqual(report.handoff, {
    state: 'required',
    profile: 'web-postgres',
    reasonCheckIds: ['chromium', 'database-variables'],
    action: {
      kind: 'github-pull-request-body-marker',
      marker: '<!-- agent-doctor-early-ci: required -->',
      timing: 'same-publication-write',
    },
    completion: {
      statusContext: 'Early CI preflight',
      headBinding: 'pull-request-head-sha',
      requiredState: 'success',
    },
  });
});

test('does not delegate an intrinsic repository defect to Early CI', () => {
  const report = evaluateEnvironmentReport(
    {
      ...healthyEnvironment,
      nodeRange: '^24.0.0',
      databaseUrl: '',
      testDatabaseUrl: '',
      postgresProbe: { state: 'not-run' },
    },
    'postgres',
  );

  assert.deepEqual(report.handoff, {
    state: 'blocked',
    profile: 'postgres',
    reasonCheckIds: ['node'],
  });
});

test('certifies only distinct numeric-loopback PostgreSQL targets', () => {
  const missing = evaluateEnvironment(
    { ...healthyEnvironment, testDatabaseUrl: '' },
    'web-postgres',
  );
  const unsafeTargets = [
    'postgresql://prisma_prim:secret@db.example.test:5432/prisma_prim_test',
    'postgresql://prisma_prim:secret@localhost:5432/prisma_prim_test',
    healthyEnvironment.databaseUrl,
    'postgresql://prisma_prim:secret@127.0.0.1:5432/prisma_prim',
  ].map((testDatabaseUrl) =>
    evaluateEnvironment(
      { ...healthyEnvironment, testDatabaseUrl },
      'web-postgres',
    ),
  );
  const encodedCollision = evaluateEnvironment(
    {
      ...healthyEnvironment,
      databaseUrl: 'postgresql://user:secret@127.0.0.1/foo%3F_test',
      testDatabaseUrl: 'postgresql://user:secret@127.0.0.1/foo%253F_test',
    },
    'web-postgres',
  );
  const ipv6 = evaluateEnvironment(
    {
      ...healthyEnvironment,
      databaseUrl: 'postgresql://user:secret@[::1]:5432/prisma_prim_dev',
      testDatabaseUrl: 'postgres://user:secret@[::1]:5432/prisma_prim_test',
    },
    'web-postgres',
  );

  assert.equal(
    missing.find((check) => check.id === 'database-variables').status,
    'FAIL',
  );
  for (const results of unsafeTargets) {
    assert.equal(
      results.find((check) => check.id === 'database-safety').status,
      'FAIL',
    );
  }
  for (const results of [
    evaluateEnvironment(
      {
        ...healthyEnvironment,
        testDatabaseUrl:
          'postgresql://user:secret@127.0.0.1:5432/prisma_prim_test?host=db.example.test',
      },
      'web-postgres',
    ),
    evaluateEnvironment(
      {
        ...healthyEnvironment,
        testDatabaseUrl: 'https://example.test/database',
      },
      'web-postgres',
    ),
    encodedCollision,
  ]) {
    assert.equal(
      results.find((check) => check.id === 'database-variables').status,
      'FAIL',
    );
    assert.equal(
      results.find((check) => check.id === 'database-safety').status,
      'SKIP',
    );
  }
  assert.equal(
    ipv6.find((check) => check.id === 'database-safety').status,
    'PASS',
  );
});

test('reports PostgreSQL connectivity independently from URL safety', () => {
  const results = evaluateEnvironment(
    {
      ...healthyEnvironment,
      postgresProbe: { state: 'service-unavailable', detail: 'ECONNREFUSED' },
    },
    'web-postgres',
  );

  assert.equal(
    results.find((check) => check.id === 'database-safety').status,
    'PASS',
  );
  assert.equal(results.find((check) => check.id === 'postgres').status, 'FAIL');
  assert.match(
    results.find((check) => check.id === 'postgres').summary,
    /No PostgreSQL service is listening/,
  );
  assert.match(
    results.find((check) => check.id === 'postgres').remediation,
    /node scripts\/managed-postgres\.mjs -- node scripts\/agent-doctor\.mjs --profile postgres/,
  );
  assert.doesNotMatch(
    results.find((check) => check.id === 'postgres').remediation,
    /use node scripts\/managed-postgres\.mjs, then retry/,
  );
});

test('distinguishes missing pnpm from a sandbox-denied pnpm subprocess', () => {
  const missing = evaluateEnvironment({
    ...healthyEnvironment,
    pnpmProbe: { state: 'missing' },
  });
  const denied = evaluateEnvironment({
    ...healthyEnvironment,
    pnpmProbe: { state: 'sandbox-denied', detail: 'EPERM' },
  });

  assert.match(
    missing.find((check) => check.id === 'pnpm').summary,
    /is not installed or not on PATH/,
  );
  assert.equal(
    missing.find((check) => check.id === 'pnpm').ciRecoverable,
    true,
  );
  assert.match(
    denied.find((check) => check.id === 'pnpm').summary,
    /sandbox denied the pnpm subprocess/,
  );
  assert.match(
    denied.find((check) => check.id === 'pnpm').remediation,
    /corepack pnpm --version/,
  );
  assert.equal(denied.find((check) => check.id === 'pnpm').ciRecoverable, true);
});

test('fails closed for unsupported or unclassified package-manager failures', () => {
  const unsupported = evaluateEnvironment({
    ...healthyEnvironment,
    packageManager: 'npm@11.20.0',
  });
  const unclassified = evaluateEnvironment({
    ...healthyEnvironment,
    pnpmProbe: { state: 'failed', detail: 'exit 1' },
  });

  assert.equal(
    unsupported.find((check) => check.id === 'pnpm').ciRecoverable,
    false,
  );
  assert.equal(
    unclassified.find((check) => check.id === 'pnpm').ciRecoverable,
    false,
  );
});

test('reports probe tooling and sandbox failures without blaming PostgreSQL', () => {
  const tooling = evaluateEnvironment(
    {
      ...healthyEnvironment,
      postgresProbe: {
        state: 'tooling-missing',
        detail: 'ERR_MODULE_NOT_FOUND',
      },
    },
    'postgres',
  );
  const denied = evaluateEnvironment(
    {
      ...healthyEnvironment,
      postgresProbe: { state: 'sandbox-denied', detail: 'EACCES' },
    },
    'postgres',
  );

  assert.match(
    tooling.find((check) => check.id === 'postgres').summary,
    /probe tooling or bootstrap is missing or broken/,
  );
  assert.match(
    denied.find((check) => check.id === 'postgres').summary,
    /sandbox denied the PostgreSQL probe subprocess \(EACCES\)/,
  );
});

test('delegates known dependency drift but not an unknown PostgreSQL bootstrap failure', () => {
  const dependencies = evaluateEnvironment(
    {
      ...healthyEnvironment,
      dependenciesInstalled: false,
      postgresProbe: { state: 'tooling-missing', detail: 'dependencies' },
    },
    'postgres',
  );
  const unknown = evaluateEnvironment(
    {
      ...healthyEnvironment,
      postgresProbe: {
        state: 'tooling-missing',
        detail: 'ERR_MODULE_NOT_FOUND',
      },
    },
    'postgres',
  );

  assert.equal(
    dependencies.find((check) => check.id === 'postgres').ciRecoverable,
    true,
  );
  assert.equal(
    unknown.find((check) => check.id === 'postgres').ciRecoverable,
    false,
  );
});

test('distinguishes an unavailable PostgreSQL service from a connection failure', () => {
  const absent = evaluateEnvironment(
    {
      ...healthyEnvironment,
      postgresProbe: { state: 'service-unavailable', detail: 'ECONNREFUSED' },
    },
    'postgres',
  );
  const rejected = evaluateEnvironment(
    {
      ...healthyEnvironment,
      postgresProbe: { state: 'connection-failed', detail: '28P01' },
    },
    'postgres',
  );

  assert.match(
    absent.find((check) => check.id === 'postgres').summary,
    /No PostgreSQL service is listening/,
  );
  assert.match(
    rejected.find((check) => check.id === 'postgres').summary,
    /PostgreSQL rejected the connection/,
  );
});

test('reports an unreachable PostgreSQL target separately from an absent service', () => {
  const results = evaluateEnvironment(
    {
      ...healthyEnvironment,
      postgresProbe: { state: 'unreachable', detail: 'ETIMEDOUT' },
    },
    'postgres',
  );

  assert.match(
    results.find((check) => check.id === 'postgres').summary,
    /target is unreachable \(ETIMEDOUT\)/,
  );
});

test('reports an outdated Node runtime with a durable remediation', () => {
  const results = evaluateEnvironment({
    ...healthyEnvironment,
    nodeVersion: 'v22.22.0',
  });
  const node = results.find((check) => check.id === 'node');

  assert.equal(node.status, 'FAIL');
  assert.equal(node.ciRecoverable, true);
  assert.match(node.remediation, /satisfying >=24\.0\.0 <25\.0\.0/);
});

test('marks an unsupported Node engine declaration as intrinsic repository drift', () => {
  const results = evaluateEnvironment({
    ...healthyEnvironment,
    nodeRange: '^24.0.0',
  });
  const node = results.find((check) => check.id === 'node');

  assert.equal(node.status, 'FAIL');
  assert.equal(node.ciRecoverable, false);
  assert.match(node.summary, /Unsupported Node engine declaration/);
});

test('marks a Node engine range that excludes the CI pin as intrinsic repository drift', () => {
  const results = evaluateEnvironment({
    ...healthyEnvironment,
    nodeRange: '>=25.0.0 <26.0.0',
    nodeVersion: 'v25.1.0',
  });
  const node = results.find((check) => check.id === 'node');

  assert.equal(node.status, 'FAIL');
  assert.equal(node.ciRecoverable, false);
  assert.match(node.summary, /Pinned Node 24 does not satisfy/);
});

test('marks absent, nonnumeric, and partially numeric CI Node pins as intrinsic', () => {
  for (const pinnedNodeVersion of ['', 'current', '24junk']) {
    const results = evaluateEnvironment({
      ...healthyEnvironment,
      pinnedNodeVersion,
    });
    const node = results.find((check) => check.id === 'node');

    assert.equal(node.status, 'FAIL');
    assert.equal(node.ciRecoverable, false);
    assert.match(node.summary, /Unsupported pinned Node version/);
    assert.match(
      node.remediation,
      /numeric Node selector such as 24 or X\.Y\.Z/,
    );
  }
});

test('does not delegate host drift when the CI Node pin is also incompatible', () => {
  const results = evaluateEnvironment({
    ...healthyEnvironment,
    nodeVersion: 'v22.22.0',
    pinnedNodeVersion: '25',
  });
  const node = results.find((check) => check.id === 'node');

  assert.equal(node.status, 'FAIL');
  assert.equal(node.ciRecoverable, false);
  assert.match(node.summary, /Pinned Node 25 does not satisfy/);
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
    pnpmProbe: { state: 'available', version: '11.16.0' },
    dependenciesInstalled: false,
    chromiumAvailable: false,
  });
  const failedIds = results
    .filter((check) => check.status === 'FAIL')
    .map((check) => check.id);

  assert.deepEqual(failedIds, ['pnpm', 'dependencies']);
});
