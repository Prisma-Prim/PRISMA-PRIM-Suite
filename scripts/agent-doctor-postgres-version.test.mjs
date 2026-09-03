import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateEnvironment } from './agent-doctor.mjs';

const healthyEnvironment = {
  nodeRange: '>=24.0.0 <25.0.0',
  nodeVersion: 'v24.0.0',
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
};

function postgresCheck(serverVersionNumber) {
  const report = evaluateEnvironment(
    {
      ...healthyEnvironment,
      postgresProbe: { state: 'available', serverVersionNumber },
    },
    'postgres',
  );

  return {
    check: report.checks.find(({ id }) => id === 'postgres'),
    report,
  };
}

test('accepts supported integer PostgreSQL 17 server versions', () => {
  for (const serverVersionNumber of [170011, 170012, 179999]) {
    const { check, report } = postgresCheck(serverVersionNumber);

    assert.equal(check.status, 'PASS');
    assert.match(check.summary, />= 170011 and < 180000/);
    assert.match(check.summary, new RegExp(`detected ${serverVersionNumber}`));
    assert.equal(check.remediation, null);
    assert.equal(check.ciRecoverable, false);
    assert.deepEqual(report.capabilities.postgres, {
      state: 'available',
      serverVersionNumber,
    });
  }
});

test('fails closed when the PostgreSQL server version is not a supported integer', () => {
  const unsupportedVersions = [
    undefined,
    null,
    'not-a-number',
    170011.5,
    160000,
    170010,
    180000,
    180001,
  ];

  for (const serverVersionNumber of unsupportedVersions) {
    const { check, report } = postgresCheck(serverVersionNumber);

    assert.equal(check.status, 'FAIL');
    assert.match(check.summary, />= 170011 and < 180000/);
    assert.match(
      check.summary,
      new RegExp(`detected ${String(serverVersionNumber)}`),
    );
    assert.match(check.remediation, /PostgreSQL 17\.11\+ within major 17/);
    assert.equal(check.ciRecoverable, true);
    assert.deepEqual(report.capabilities.postgres, {
      state: 'available',
      serverVersionNumber,
    });
  }
});
