import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectEnvironment, evaluateEnvironment } from './agent-doctor.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const earlyCiCommand = 'gh workflow run early-ci.yml --ref <branch>';
const minimumMigrationPostgresVersion = 130000;

const sharedPrerequisites = [
  'node',
  'pnpm',
  'workspace',
  'lockfile',
  'dependencies',
];

const verificationDefinitions = [
  {
    id: 'postgres-and-migration',
    command: 'test:preflight:postgres',
    covers: ['postgres-smoke', 'previous-schema-migration'],
    prerequisites: [
      ...sharedPrerequisites,
      'database-variables',
      'database-safety',
      'postgres',
      'database-administration',
      'migration-manifest',
    ],
  },
  {
    id: 'desktop-and-narrow-browser',
    command: 'test:preflight:playwright',
    covers: ['playwright-desktop', 'playwright-narrow'],
    prerequisites: [...sharedPrerequisites, 'chromium'],
  },
];

export function evaluateMigrationDatabaseCapability(postgresProbe) {
  const available = postgresProbe?.state === 'available';
  const canCreateDatabase = postgresProbe?.canCreateDatabase === true;
  const serverVersionSupported =
    Number.isInteger(postgresProbe?.serverVersionNumber) &&
    postgresProbe.serverVersionNumber >= minimumMigrationPostgresVersion;
  const capable = available && canCreateDatabase && serverVersionSupported;

  let summary;
  if (!available) {
    summary = 'Migration database capabilities could not be verified.';
  } else if (!canCreateDatabase) {
    summary =
      'The PostgreSQL role cannot create isolated migration databases.';
  } else if (!serverVersionSupported) {
    summary =
      'PostgreSQL 13 or newer is required for forced migration cleanup.';
  } else {
    summary =
      'The PostgreSQL role can create isolated databases and clean them up safely.';
  }

  return {
    id: 'database-administration',
    status: capable ? 'PASS' : 'FAIL',
    summary,
    remediation: capable
      ? null
      : 'Use PostgreSQL 13 or newer with a local role granted CREATEDB, or delegate this seam to Early CI.',
  };
}

export function collectPreflightChecks(environment = {}) {
  const journalPath = resolve(
    repositoryRoot,
    'apps/api/drizzle/meta/_journal.json',
  );
  let migrationManifestAvailable;
  try {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    migrationManifestAvailable =
      journal.entries.length > 1 &&
      journal.entries.every((entry) =>
        existsSync(
          resolve(repositoryRoot, 'apps/api/drizzle', `${entry.tag}.sql`),
        ),
      );
  } catch {
    migrationManifestAvailable = false;
  }

  return [
    evaluateMigrationDatabaseCapability(environment.postgresProbe),
    {
      id: 'migration-manifest',
      status: migrationManifestAvailable ? 'PASS' : 'FAIL',
      summary: migrationManifestAvailable
        ? 'The previous and current committed migration states are reproducible.'
        : 'The migration journal or one of its committed SQL files is incomplete.',
      remediation: migrationManifestAvailable
        ? null
        : 'Restore the Drizzle journal and every referenced migration SQL file.',
    },
  ];
}

function failedChecks(checks, ids) {
  return ids.flatMap((id) => {
    const check = checks.find((candidate) => candidate.id === id);
    return check
      ? check.status === 'FAIL'
        ? [check]
        : []
      : [
          {
            id,
            status: 'FAIL',
            summary: `Required ${id} check is missing from the preflight.`,
            remediation:
              'Restore the prerequisite check before trusting local execution.',
          },
        ];
  });
}

function checkReason(check) {
  return [check.summary, check.remediation]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createPreflightPlan({ doctorChecks }) {
  const verifications = verificationDefinitions.map((definition) => {
    const failures = failedChecks(doctorChecks, definition.prerequisites);
    const runnable = failures.length === 0;
    return {
      ...definition,
      localStatus: runnable
        ? 'runnable-locally'
        : 'blocked-locally-with-reason',
      authority: runnable ? 'local-and-full-ci' : 'delegated-to-early-ci',
      reason: runnable
        ? 'All required local prerequisites are available.'
        : [...new Set(failures.map(checkReason))].join(' '),
    };
  });
  const seams = verifications.flatMap((verification) =>
    verification.covers.map((id) => ({
      id,
      command: verification.command,
      localStatus: verification.localStatus,
      authority: verification.authority,
      reason: verification.reason,
    })),
  );

  return { earlyCiCommand, verifications, seams };
}

function label(value) {
  return value.replaceAll('-', ' ').toUpperCase();
}

export function formatPreflightReport(plan) {
  const lines = ['Local CI preflight'];
  for (const seam of plan.seams) {
    lines.push(`${label(seam.localStatus)} ${seam.id}: ${seam.reason}`);
    lines.push(
      seam.authority === 'delegated-to-early-ci'
        ? `${label(seam.authority)} ${seam.id}: run ${plan.earlyCiCommand}`
        : `${label(seam.authority)} ${seam.id}: local evidence is repeated by normal CI`,
    );
  }
  return lines.join('\n');
}

export function commandsForRunnableVerifications(plan) {
  return plan.verifications
    .filter((verification) => verification.localStatus === 'runnable-locally')
    .map((verification) => verification.command);
}

function packageScriptInvocation(script) {
  const pnpmEntrypoint = process.env.npm_execpath;
  if (pnpmEntrypoint) {
    return {
      command: process.execPath,
      args: [pnpmEntrypoint, script],
    };
  }
  return { command: 'pnpm', args: [script] };
}

function runPackageScript(script) {
  const invocation = packageScriptInvocation(script);
  return spawnSync(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 15 * 60 * 1_000,
    windowsHide: true,
  });
}

export function main() {
  const json = process.argv.includes('--json');
  const checkOnly = process.argv.includes('--check-only');
  const environment = collectEnvironment('web-postgres');
  const doctorChecks = [
    ...evaluateEnvironment(environment, 'web-postgres'),
    ...collectPreflightChecks(environment),
  ];
  const plan = createPreflightPlan({ doctorChecks });

  process.stdout.write(
    `${json ? JSON.stringify(plan, null, 2) : formatPreflightReport(plan)}\n`,
  );

  const blocked = plan.seams.some(
    (seam) => seam.localStatus === 'blocked-locally-with-reason',
  );
  if (checkOnly) {
    if (blocked) process.exitCode = 2;
    return;
  }

  const scripts = commandsForRunnableVerifications(plan);
  for (const script of scripts) {
    process.stdout.write(`RUNNABLE LOCALLY ${script}: starting\n`);
    const result = runPackageScript(script);
    if (result.error) {
      process.stderr.write(
        `Local preflight could not start ${script}: ${result.error.code ?? result.error.message}\n`,
      );
      process.exitCode = 1;
      return;
    }
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }

  if (blocked) {
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();
