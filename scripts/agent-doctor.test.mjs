import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareVersions,
  evaluateEnvironment,
  maximumExclusiveVersion,
  minimumVersion,
  packageManagerVersion,
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
};

test('parses and compares semantic runtime versions', () => {
  assert.deepEqual(parseVersion('v24.14.0'), [24, 14, 0]);
  assert.equal(compareVersions([24, 1, 0], [24, 0, 9]), 1);
  assert.deepEqual(minimumVersion('>=24.0.0 <25.0.0'), [24, 0, 0]);
  assert.deepEqual(maximumExclusiveVersion('>=24.0.0 <25.0.0'), [25, 0, 0]);
  assert.equal(packageManagerVersion('pnpm@11.20.0'), '11.20.0');
});

test('accepts the complete canonical environment', () => {
  const results = evaluateEnvironment(healthyEnvironment);
  assert.equal(
    results.some((check) => check.status === 'FAIL'),
    false,
  );
  assert.equal(results.find((check) => check.id === 'chromium').status, 'SKIP');
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
