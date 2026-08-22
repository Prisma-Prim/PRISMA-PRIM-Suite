import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectEnvironment } from './agent-doctor.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const earlyCiDelegation = {
  connector: 'apply the early-ci label to the open pull request',
  statusContext: 'Early CI preflight',
  githubUi: 'run Early CI preflight for the exact branch from Actions',
  gh: 'gh workflow run early-ci.yml --ref <branch>',
};
const minimumMigrationPostgresVersion = 130000;

const sharedPrerequisites = [
  'node',
  'pnpm',
  'workspace',
  'lockfile',
  'dependencies',
];

const postgresPrerequisites = [
  ...sharedPrerequisites,
  'database-variables',
  'database-safety',
  'postgres',
];

const verificationDefinitions = [
  {
    id: 'postgres-smoke',
    command: 'test:preflight:postgres-smoke',
    covers: ['postgres-smoke'],
    prerequisites: postgresPrerequisites,
  },
  {
    id: 'previous-schema-migration',
    command: 'test:preflight:migration',
    covers: ['previous-schema-migration'],
    prerequisites: [
      ...postgresPrerequisites,
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

function evaluateMigrationDatabaseCapability(postgresProbe) {
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
    summary = 'The PostgreSQL role cannot create isolated migration databases.';
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
    ciRecoverable: true,
    summary,
    remediation: capable
      ? null
      : 'Use PostgreSQL 13 or newer with a local role granted CREATEDB, or delegate this seam to Early CI.',
  };
}

function migrationManifestIsAvailable() {
  const journalPath = resolve(
    repositoryRoot,
    'apps/api/drizzle/meta/_journal.json',
  );
  try {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    return (
      journal.entries.length > 1 &&
      journal.entries.every((entry) =>
        existsSync(
          resolve(repositoryRoot, 'apps/api/drizzle', `${entry.tag}.sql`),
        ),
      )
    );
  } catch {
    return false;
  }
}

function collectPreflightChecks(capabilities = {}, migrationManifestAvailable) {
  return [
    evaluateMigrationDatabaseCapability(capabilities.postgres),
    {
      id: 'migration-manifest',
      status: migrationManifestAvailable ? 'PASS' : 'FAIL',
      ciRecoverable: false,
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
      ? check.status !== 'PASS'
        ? [check]
        : []
      : [
          {
            id,
            status: 'FAIL',
            ciRecoverable: false,
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

function createPreflightPlan({ doctorChecks }) {
  const verifications = verificationDefinitions.map((definition) => {
    const failures = failedChecks(doctorChecks, definition.prerequisites);
    const runnable = failures.length === 0;
    const recoverable =
      !runnable && failures.every((check) => check.ciRecoverable === true);
    return {
      ...definition,
      localStatus: runnable
        ? 'runnable-locally'
        : 'blocked-locally-with-reason',
      authority: runnable
        ? 'local-and-full-ci'
        : recoverable
          ? 'delegated-to-early-ci'
          : 'blocked-without-ci-recovery',
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

  return {
    earlyCiDelegation,
    deliveryStatus: verifications.some(
      (verification) =>
        verification.authority === 'blocked-without-ci-recovery',
    )
      ? 'blocked'
      : 'ready',
    verifications,
    seams,
  };
}

function label(value) {
  return value.replaceAll('-', ' ').toUpperCase();
}

function formatPreflightReport(plan) {
  const lines = ['Local CI preflight'];
  for (const seam of plan.seams) {
    lines.push(`${label(seam.localStatus)} ${seam.id}: ${seam.reason}`);
    if (seam.authority === 'delegated-to-early-ci') {
      lines.push(
        `${label(seam.authority)} ${seam.id}: ${plan.earlyCiDelegation.connector}; watch ${plan.earlyCiDelegation.statusContext}. UI fallback: ${plan.earlyCiDelegation.githubUi}. gh fallback: ${plan.earlyCiDelegation.gh}`,
      );
    } else if (seam.authority === 'blocked-without-ci-recovery') {
      lines.push(`${label(seam.authority)} ${seam.id}: ${seam.reason}`);
    } else {
      lines.push(
        `${label(seam.authority)} ${seam.id}: local evidence is repeated by normal CI`,
      );
    }
  }
  return lines.join('\n');
}

function commandsForRunnableVerifications(plan) {
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

export function runLocalCiPreflight({
  args,
  inspection,
  migrationManifestAvailable,
  runScript,
  writeOutput,
  writeError,
}) {
  const json = args.includes('--json');
  const checkOnly = args.includes('--check-only');
  const doctorChecks = [
    ...inspection.checks,
    ...collectPreflightChecks(
      inspection.capabilities,
      migrationManifestAvailable,
    ),
  ];
  const plan = createPreflightPlan({ doctorChecks });

  writeOutput(
    `${json ? JSON.stringify(plan, null, 2) : formatPreflightReport(plan)}\n`,
  );

  const locallyBlocked = plan.seams.some(
    (seam) => seam.localStatus === 'blocked-locally-with-reason',
  );
  if (checkOnly) return plan.deliveryStatus === 'ready' ? 0 : 2;

  for (const script of commandsForRunnableVerifications(plan)) {
    writeOutput(`RUNNABLE LOCALLY ${script}: starting\n`);
    const result = runScript(script);
    if (result.error) {
      writeError(
        `Local preflight could not start ${script}: ${result.error.code ?? result.error.message}\n`,
      );
      return 1;
    }
    if (result.status !== 0) return 1;
  }

  return locallyBlocked ? 2 : 0;
}

function main() {
  const inspection = inspectEnvironment('web-postgres');
  process.exitCode = runLocalCiPreflight({
    args: process.argv.slice(2),
    inspection,
    migrationManifestAvailable: migrationManifestIsAvailable(),
    runScript: runPackageScript,
    writeOutput: (value) => process.stdout.write(value),
    writeError: (value) => process.stderr.write(value),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();
