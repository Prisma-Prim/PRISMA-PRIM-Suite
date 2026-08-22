import assert from 'node:assert/strict';
import test from 'node:test';

import * as localCiPreflight from './local-ci-preflight.mjs';

const healthyInspectionChecks = [
  { id: 'node', status: 'PASS', summary: 'Node is supported.' },
  { id: 'pnpm', status: 'PASS', summary: 'pnpm is supported.' },
  { id: 'workspace', status: 'PASS', summary: 'Workspace exists.' },
  { id: 'lockfile', status: 'PASS', summary: 'Lockfile exists.' },
  { id: 'dependencies', status: 'PASS', summary: 'Dependencies exist.' },
  { id: 'chromium', status: 'PASS', summary: 'Chromium is available.' },
  {
    id: 'database-variables',
    status: 'PASS',
    summary: 'Database variables are valid.',
  },
  {
    id: 'database-safety',
    status: 'PASS',
    summary: 'Database targets are safe.',
  },
  { id: 'postgres', status: 'PASS', summary: 'PostgreSQL is available.' },
];

const healthyPostgresCapability = {
  state: 'available',
  serverVersionNumber: 170000,
  canCreateDatabase: true,
};

function runPreflight({
  args = ['--check-only'],
  checks = healthyInspectionChecks,
  postgres = healthyPostgresCapability,
  migrationManifestAvailable = true,
  runScript = () => ({ status: 0 }),
} = {}) {
  const stdout = [];
  const stderr = [];
  const executedScripts = [];
  const exitCode = localCiPreflight.runLocalCiPreflight({
    args,
    inspection: { checks, capabilities: { postgres } },
    migrationManifestAvailable,
    runScript(script) {
      executedScripts.push(script);
      return runScript(script);
    },
    writeOutput(value) {
      stdout.push(value);
    },
    writeError(value) {
      stderr.push(value);
    },
  });

  return { exitCode, executedScripts, stderr, stdout };
}

function replaceCheck(id, replacement) {
  return healthyInspectionChecks.map((check) =>
    check.id === id ? { ...check, ...replacement } : check,
  );
}

test('exposes one stable orchestration interface', () => {
  assert.deepEqual(Object.keys(localCiPreflight), ['runLocalCiPreflight']);
});

test('returns zero without executing commands for a healthy check-only preflight', () => {
  const { exitCode, executedScripts, stderr, stdout } = runPreflight();

  assert.equal(exitCode, 0);
  assert.deepEqual(executedScripts, []);
  assert.deepEqual(stderr, []);
  assert.match(stdout.join(''), /^Local CI preflight\n/);
  for (const seam of [
    'postgres-smoke',
    'previous-schema-migration',
    'playwright-desktop',
    'playwright-narrow',
  ]) {
    assert.match(stdout.join(''), new RegExp(`LOCAL AND FULL CI ${seam}`));
  }
});

test('accepts exact-head CI delegation for a recoverable check-only blocker', () => {
  const checks = replaceCheck('chromium', {
    status: 'FAIL',
    ciRecoverable: true,
    summary: 'Chromium is missing.',
    remediation: 'Install Chromium explicitly.',
  });

  const { exitCode, executedScripts, stderr, stdout } = runPreflight({
    checks,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(executedScripts, []);
  assert.deepEqual(stderr, []);
  assert.match(stdout.join(''), /Chromium is missing/);
  assert.match(stdout.join(''), /DELEGATED TO EARLY CI playwright-narrow/);
  assert.match(stdout.join(''), /apply the early-ci label/u);
  assert.match(stdout.join(''), /Early CI preflight/u);
  assert.match(stdout.join(''), /gh workflow run early-ci\.yml --ref <branch>/);
});

test('fails closed for an intrinsic defect even when its check ID is usually recoverable', () => {
  const checks = replaceCheck('node', {
    status: 'FAIL',
    ciRecoverable: false,
    summary: 'Unsupported Node engine declaration: ^24.0.0.',
    remediation: 'Declare a supported bounded Node engine range.',
  });

  const { exitCode, stdout } = runPreflight({ checks });

  assert.equal(exitCode, 2);
  assert.match(stdout.join(''), /Unsupported Node engine declaration/);
  assert.match(stdout.join(''), /BLOCKED WITHOUT CI RECOVERY postgres-smoke/);
  assert.doesNotMatch(stdout.join(''), /DELEGATED TO EARLY CI postgres-smoke/);
});

test('fails closed when a failed check omits recoverability metadata', () => {
  const checks = replaceCheck('node', {
    status: 'FAIL',
    summary: 'Unclassified Node failure.',
  });

  const { exitCode, stdout } = runPreflight({ checks });

  assert.equal(exitCode, 2);
  assert.match(stdout.join(''), /BLOCKED WITHOUT CI RECOVERY postgres-smoke/);
});

test('delegates a skipped harness prerequisite during check-only planning', () => {
  const checks = replaceCheck('database-safety', {
    status: 'SKIP',
    ciRecoverable: true,
    summary: 'Database safety could not be established.',
    remediation: 'Configure isolated database targets.',
  });

  const { exitCode, stdout } = runPreflight({ checks });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Database safety could not be established/);
  assert.match(stdout.join(''), /DELEGATED TO EARLY CI postgres-smoke/);
});

test('fails closed when an expected Agent Doctor prerequisite is absent', () => {
  const checks = healthyInspectionChecks.filter(
    (check) => check.id !== 'database-safety',
  );

  const { exitCode, stdout } = runPreflight({ checks });

  assert.equal(exitCode, 2);
  assert.match(stdout.join(''), /database-safety check is missing/);
  assert.match(stdout.join(''), /BLOCKED WITHOUT CI RECOVERY postgres-smoke/);
  assert.match(stdout.join(''), /LOCAL AND FULL CI playwright-narrow/);
});

test('delegates only migration verification when the local role cannot create databases', () => {
  const { exitCode, stdout } = runPreflight({
    postgres: {
      ...healthyPostgresCapability,
      canCreateDatabase: false,
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /cannot create isolated migration databases/);
  assert.match(stdout.join(''), /LOCAL AND FULL CI postgres-smoke/);
  assert.match(
    stdout.join(''),
    /DELEGATED TO EARLY CI previous-schema-migration/,
  );
});

test('delegates migration cleanup when local PostgreSQL is too old', () => {
  const { exitCode, stdout } = runPreflight({
    postgres: {
      ...healthyPostgresCapability,
      serverVersionNumber: 120000,
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /PostgreSQL 13 or newer/);
  assert.match(stdout.join(''), /LOCAL AND FULL CI postgres-smoke/);
});

test('keeps an incomplete migration manifest from blocking other seams', () => {
  const { exitCode, stdout } = runPreflight({
    migrationManifestAvailable: false,
  });

  assert.equal(exitCode, 2);
  assert.match(stdout.join(''), /migration journal/);
  assert.match(stdout.join(''), /LOCAL AND FULL CI postgres-smoke/);
  assert.match(stdout.join(''), /LOCAL AND FULL CI playwright-narrow/);
  assert.match(
    stdout.join(''),
    /BLOCKED WITHOUT CI RECOVERY previous-schema-migration/,
  );
});

test('prints the report before running healthy verifications in canonical order', () => {
  const { exitCode, executedScripts, stderr, stdout } = runPreflight({
    args: [],
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(executedScripts, [
    'test:preflight:postgres-smoke',
    'test:preflight:migration',
    'test:preflight:playwright',
  ]);
  assert.deepEqual(stderr, []);
  assert.match(stdout[0], /^Local CI preflight\n/);
  assert.deepEqual(stdout.slice(1), [
    'RUNNABLE LOCALLY test:preflight:postgres-smoke: starting\n',
    'RUNNABLE LOCALLY test:preflight:migration: starting\n',
    'RUNNABLE LOCALLY test:preflight:playwright: starting\n',
  ]);
});

test('runs available verification before returning two for delegated seams', () => {
  const checks = replaceCheck('postgres', {
    status: 'FAIL',
    ciRecoverable: true,
    summary: 'PostgreSQL is unavailable.',
    remediation: 'Configure an isolated local test database.',
  });

  const { exitCode, executedScripts, stdout } = runPreflight({
    args: [],
    checks,
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(executedScripts, ['test:preflight:playwright']);
  assert.match(stdout[0], /DELEGATED TO EARLY CI postgres-smoke/);
  assert.equal(
    stdout.at(-1),
    'RUNNABLE LOCALLY test:preflight:playwright: starting\n',
  );
});

test('normalizes every nonzero child status to exit one and stops', () => {
  const { exitCode, executedScripts, stderr } = runPreflight({
    args: [],
    runScript: () => ({ status: 7 }),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(executedScripts, ['test:preflight:postgres-smoke']);
  assert.deepEqual(stderr, []);
});

test('returns one with an actionable error when a command cannot start', () => {
  const { exitCode, executedScripts, stderr } = runPreflight({
    args: [],
    runScript: () => ({ error: { code: 'ENOENT' }, status: null }),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(executedScripts, ['test:preflight:postgres-smoke']);
  assert.deepEqual(stderr, [
    'Local preflight could not start test:preflight:postgres-smoke: ENOENT\n',
  ]);
});

test('emits a valid plan as the only JSON check-only output', () => {
  const { exitCode, executedScripts, stderr, stdout } = runPreflight({
    args: ['--json', '--check-only'],
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(executedScripts, []);
  assert.deepEqual(stderr, []);
  assert.equal(stdout.length, 1);
  const plan = JSON.parse(stdout[0]);
  assert.deepEqual(
    plan.seams.map((seam) => seam.id),
    [
      'postgres-smoke',
      'previous-schema-migration',
      'playwright-desktop',
      'playwright-narrow',
    ],
  );
  assert.deepEqual(plan.earlyCiDelegation, {
    connector: 'apply the early-ci label to the open pull request',
    statusContext: 'Early CI preflight',
    githubUi: 'run Early CI preflight for the exact branch from Actions',
    gh: 'gh workflow run early-ci.yml --ref <branch>',
  });
  assert.equal(plan.deliveryStatus, 'ready');
});
