import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commandsForRunnableVerifications,
  createPreflightPlan,
  evaluateMigrationDatabaseCapability,
  formatPreflightReport,
} from './local-ci-preflight.mjs';

const healthyChecks = [
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
  {
    id: 'database-administration',
    status: 'PASS',
    summary: 'Migration database administration is available.',
  },
  {
    id: 'migration-manifest',
    status: 'PASS',
    summary: 'Migration states are reproducible.',
  },
];

test('marks PostgreSQL, migration, desktop, and narrow seams runnable when prerequisites pass', () => {
  const plan = createPreflightPlan({ doctorChecks: healthyChecks });

  assert.deepEqual(
    plan.seams.map(({ id, localStatus, authority }) => ({
      id,
      localStatus,
      authority,
    })),
    [
      {
        id: 'postgres-smoke',
        localStatus: 'runnable-locally',
        authority: 'local-and-full-ci',
      },
      {
        id: 'previous-schema-migration',
        localStatus: 'runnable-locally',
        authority: 'local-and-full-ci',
      },
      {
        id: 'playwright-desktop',
        localStatus: 'runnable-locally',
        authority: 'local-and-full-ci',
      },
      {
        id: 'playwright-narrow',
        localStatus: 'runnable-locally',
        authority: 'local-and-full-ci',
      },
    ],
  );
  assert.match(formatPreflightReport(plan), /LOCAL AND FULL CI postgres-smoke/);
  assert.deepEqual(commandsForRunnableVerifications(plan), [
    'test:preflight:postgres-smoke',
    'test:preflight:migration',
    'test:preflight:playwright',
  ]);
});

test('reports actionable local blockers and delegates the same seams to early CI', () => {
  const plan = createPreflightPlan({
    doctorChecks: healthyChecks.map((check) =>
      check.id === 'chromium'
        ? {
            ...check,
            status: 'FAIL',
            summary: 'Chromium is missing.',
            remediation: 'Install Chromium explicitly.',
          }
        : check.id === 'postgres'
          ? {
              ...check,
              status: 'FAIL',
              summary: 'PostgreSQL is unavailable.',
              remediation: 'Configure an isolated local test database.',
            }
          : check,
    ),
  });

  for (const seam of plan.seams) {
    assert.equal(seam.localStatus, 'blocked-locally-with-reason');
    assert.equal(seam.authority, 'delegated-to-early-ci');
  }
  assert.match(plan.seams[0].reason, /PostgreSQL is unavailable/);
  assert.match(plan.seams[2].reason, /Chromium is missing/);

  const report = formatPreflightReport(plan);
  assert.match(report, /BLOCKED LOCALLY WITH REASON postgres-smoke/);
  assert.match(report, /DELEGATED TO EARLY CI playwright-narrow/);
  assert.match(report, /gh workflow run early-ci\.yml --ref <branch>/);
});

test('blocks database verification when the role cannot create migration databases', () => {
  const capability = evaluateMigrationDatabaseCapability({
    state: 'available',
    serverVersionNumber: 170000,
    canCreateDatabase: false,
  });
  const plan = createPreflightPlan({
    doctorChecks: healthyChecks.map((check) =>
      check.id === 'database-administration' ? capability : check,
    ),
  });

  assert.equal(capability.status, 'FAIL');
  assert.match(
    capability.summary,
    /cannot create isolated migration databases/,
  );
  assert.deepEqual(commandsForRunnableVerifications(plan), [
    'test:preflight:postgres-smoke',
    'test:preflight:playwright',
  ]);
  assert.equal(
    plan.seams.find((seam) => seam.id === 'postgres-smoke').localStatus,
    'runnable-locally',
  );
  assert.equal(
    plan.seams.find((seam) => seam.id === 'previous-schema-migration')
      .localStatus,
    'blocked-locally-with-reason',
  );
});

test('requires PostgreSQL 13 or newer for forced migration cleanup', () => {
  const capability = evaluateMigrationDatabaseCapability({
    state: 'available',
    serverVersionNumber: 120000,
    canCreateDatabase: true,
  });

  assert.equal(capability.status, 'FAIL');
  assert.match(capability.summary, /PostgreSQL 13 or newer/);
});

test('keeps runnable browser verification scheduled when PostgreSQL is delegated', () => {
  const plan = createPreflightPlan({
    doctorChecks: healthyChecks.map((check) =>
      check.id === 'postgres'
        ? {
            ...check,
            status: 'FAIL',
            summary: 'PostgreSQL is unavailable.',
          }
        : check,
    ),
  });

  assert.deepEqual(commandsForRunnableVerifications(plan), [
    'test:preflight:playwright',
  ]);
});

test('blocks every seam when the shared runtime cannot execute repository scripts', () => {
  const plan = createPreflightPlan({
    doctorChecks: healthyChecks.map((check) =>
      check.id === 'node'
        ? {
            ...check,
            status: 'FAIL',
            summary: 'Node is outside the supported range.',
            remediation: 'Use Node 24.',
          }
        : check,
    ),
  });

  assert.equal(
    plan.seams.every(
      (seam) => seam.localStatus === 'blocked-locally-with-reason',
    ),
    true,
  );
  assert.match(plan.seams[3].reason, /Node is outside the supported range/);
});

test('keeps an incomplete migration manifest from blocking PostgreSQL smoke', () => {
  const plan = createPreflightPlan({
    doctorChecks: healthyChecks.map((check) =>
      check.id === 'migration-manifest'
        ? { ...check, status: 'FAIL', summary: `${check.id} is incomplete.` }
        : check,
    ),
  });

  assert.equal(plan.seams[0].localStatus, 'runnable-locally');
  assert.match(plan.seams[1].reason, /migration-manifest is incomplete/);
  assert.equal(plan.seams[2].localStatus, 'runnable-locally');
  assert.equal(plan.seams[3].localStatus, 'runnable-locally');
});

test('fails closed when an expected doctor prerequisite disappears', () => {
  const plan = createPreflightPlan({
    doctorChecks: healthyChecks.filter(
      (check) => check.id !== 'database-safety',
    ),
  });

  assert.match(plan.seams[0].reason, /database-safety check is missing/);
  assert.equal(plan.seams[0].localStatus, 'blocked-locally-with-reason');
  assert.equal(plan.seams[1].localStatus, 'blocked-locally-with-reason');
  assert.equal(plan.seams[2].localStatus, 'runnable-locally');
});
